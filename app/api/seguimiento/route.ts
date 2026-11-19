import {randomUUID} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {authorized} from '../../../lib/security';
import {db,cleanError} from '../../../lib/db';
import {readPublishedIntegrations,type PublishedIntegration} from '../../../lib/publication';
import type {PoolClient} from 'pg';

export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
const fields=['dependency','development_close','test_close','validation_close','considerations'] as const;
type Field=typeof fields[number];
type FieldValues=Record<Field,string>;
type Draft={id:string;expected:FieldValues;values:FieldValues};
type Approved={id:string;integration_id:string;observed_on:Date|string;detail:string;agreement:string;pending:string;responsible:string;name:string;approved_at:string};
const texts=(row:PublishedIntegration):FieldValues=>({
 dependency:row.dependency||'',development_close:row.development_close||'',
 test_close:row.test_close||'',validation_close:row.validation_close||'',
 considerations:row.considerations||''
});
const normalize=(v:string)=>v.replace(/\s+/g,' ').trim().toLocaleLowerCase('es');
const equal=(a:FieldValues,b:FieldValues)=>fields.every(k=>a[k]===b[k]);
const dates=(v:Date|string)=>v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
const toLine=(p:Approved)=>{
 const date=dates(p.observed_on);
 return date.slice(8,10)+'/'+date.slice(5,7)+' - '+p.detail.trim()+
   (p.agreement?.trim()?' | Acuerdo: '+p.agreement.trim():'')+
   (p.pending?.trim()?' | Pendiente: '+p.responsible.trim()+': '+p.pending.trim():'');
};
function parseDrafts(value:unknown):Draft[]{
 if(!Array.isArray(value)||value.length>35)throw Error('Se permiten hasta 35 integraciones por publicación.');
 const seen=new Set<string>(),out:Draft[]=[];
 for(const raw of value){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Edición inválida.');
  const item=raw as Record<string,unknown>,id=String(item.id||'');
  if(!/^\d+$/.test(id)||seen.has(id))throw Error('Las integraciones editadas no pueden repetirse.');
  seen.add(id);
  const expected={} as FieldValues,values={} as FieldValues;
  for(const k of fields){
   const max=k==='considerations'?8000:200;
   const old=(item.expected as Record<string,unknown>|undefined)?.[k];
   const next=(item.values as Record<string,unknown>|undefined)?.[k];
   if(typeof old!=='string'||typeof next!=='string'||old.length>max||next.length>max||
      old.includes('\0')||next.includes('\0'))throw Error('Campo inválido o demasiado largo: '+k);
   expected[k]=old;values[k]=next;
  }
  out.push({id,expected,values});
 }
 return out;
}
async function eligible(client:PoolClient,batchId:string):Promise<Approved[]>{
 const sql=[
  'SELECT p.id::text AS id,p.integration_id::text AS integration_id,p.observed_on,p.detail,',
  'p.agreement,p.pending,p.responsible,i.name,p.approved_at::text AS approved_at',
  'FROM integraciones_laboral.chatgpt_review_proposals p',
  'JOIN integraciones_laboral.integrations i ON i.id=p.integration_id',
  'JOIN public.tactical_tracking t ON lower(btrim(t.integration_name))=lower(btrim(i.name))',
  'AND t.is_active=TRUE AND t.source_batch_id=$1::uuid',
  'LEFT JOIN integraciones_laboral.dashboard_published_proposals a ON a.proposal_id=p.id',
  "WHERE p.review_status='Aprobado' AND p.approved_at IS NOT NULL",
  'AND p.approved_at>(SELECT max(e.created_at) FROM public.tactical_migration_events e',
  "WHERE e.batch_id=$1::uuid AND e.event_type='published')",
  'AND a.proposal_id IS NULL',
  'ORDER BY p.observed_on,p.id'
 ].join(' ');
 const r=await client.query<Approved>(sql,[batchId]);
 return r.rows;
}
const error=(message:string,status:number)=>NextResponse.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:NextRequest){
 if(!await authorized(req))return error('No autorizado',401);
 const client=await db().connect();
 try{
  const rows=await readPublishedIntegrations(client);
  const batchId=rows[0].source_batch_id;
  const proposals=await eligible(client,batchId);
  return NextResponse.json({batchId,sourceLabel:rows[0].source_label,
   publishedAt:rows[0].last_published_at,approvedCount:proposals.length,
   approved:proposals.map(p=>({id:p.id,integration:p.name,day:dates(p.observed_on),detail:p.detail}))},
   {headers:{'Cache-Control':'no-store'}});
 }catch(e){return error(cleanError(e),500)}finally{client.release()}
}

export async function POST(req:NextRequest){
 const user=await authorized(req);if(!user)return error('No autorizado',401);
 const body=await req.json().catch(()=>null);
 if(!body||typeof body!=='object'||body.confirm!==true)return error('Confirma expresamente la publicación.',400);
 let drafts:Draft[];
 try{drafts=parseDrafts(body.drafts||[])}catch(e){return error(e instanceof Error?e.message:'Ediciones inválidas',400)}
 const claimed=body.proposalIds;
 if(!Array.isArray(claimed)||claimed.some((v:unknown)=>!(/^\d+$/.test(String(v))))||
    new Set(claimed.map(String)).size!==claimed.length)return error('Actualiza la previsualización de propuestas aprobadas.',400);
 const client=await db().connect();
 try{
  await client.query('BEGIN');
  const ctl=await client.query(
   "SELECT published_batch_id,active_source,neon_read_enabled FROM public.migration_source_controls "+
   "WHERE module_key='resumen_tactico' FOR UPDATE");
  if(!ctl.rowCount||ctl.rows[0].active_source!=='neon'||!ctl.rows[0].neon_read_enabled) {
   await client.query('ROLLBACK');return error('El dashboard no está leyendo la publicación de Neon.',409);
  }
  const batchId=String(ctl.rows[0].published_batch_id||'');
  if(batchId!==String(body.batchId||'')){
   await client.query('ROLLBACK');return error('Existe una versión Excel más reciente. Actualiza antes de publicar.',409);
  }
  const rows=await readPublishedIntegrations(client);
  const byId=new Map(rows.map(r=>[String(r.id),r]));
  const proposals=await eligible(client,batchId);
  const actualIds=proposals.map(p=>p.id).sort((a,b)=>Number(a)-Number(b));
  const claimedIds=claimed.map(String).sort((a:string,b:string)=>Number(a)-Number(b));
  if(actualIds.join(',')!==claimedIds.join(',')){
   await client.query('ROLLBACK');return error('Cambió la lista de propuestas aprobadas. Actualiza y revisa antes de publicar.',409);
  }
  const changes=new Map<string,{row:PublishedIntegration;before:FieldValues;after:FieldValues;history:string;proposalIds:string[]}>();
  for(const d of drafts){
   const row=byId.get(d.id);
   if(!row){await client.query('ROLLBACK');return error('Integración fuera del lote publicado.',409)}
   const before=texts(row);
   if(!equal(before,d.expected)){
    await client.query('ROLLBACK');return error('Los campos de '+row.name+' cambiaron. Recarga el editor para no sobrescribirlos.',409);
   }
   if(!equal(before,d.values))changes.set(d.id,{row,before,after:d.values,history:row.situational_log,proposalIds:[]});
  }
  for(const p of proposals){
   const row=byId.get(p.integration_id);
   if(!row){await client.query('ROLLBACK');return error('La propuesta '+p.id+' no pertenece a una integración publicada.',409)}
   let change=changes.get(p.integration_id);
   if(!change){change={row,before:texts(row),after:texts(row),history:row.situational_log,proposalIds:[]};
    changes.set(p.integration_id,change)}
   const line=toLine(p),existing=new Set(change.history.split(/\r?\n/).map(normalize));
   if(!existing.has(normalize(line)))change.history=[change.history.trimEnd(),line].filter(Boolean).join('\n');
   change.proposalIds.push(p.id);
  }
  if(changes.size===0){
   await client.query('COMMIT');
   return NextResponse.json({published:false,rowsChanged:0,proposalsApplied:0,
    message:'No existen cambios ni propuestas aprobadas nuevas para publicar.'});
  }
  const publicationId=randomUUID();
  const audit=[...changes.values()].map(c=>({
   integration:c.row.name,sourceRow:c.row.source_row,before:{...c.before,history:c.row.situational_log},
   after:{...c.after,history:c.history},proposalIds:c.proposalIds
  }));
  await client.query(
   "INSERT INTO integraciones_laboral.dashboard_publications(id,source_batch_id,actor_email,changes) VALUES($1::uuid,$2::uuid,$3,$4::jsonb)",
   [publicationId,batchId,user.email,JSON.stringify(audit)]);
  const insertSql=[
   'INSERT INTO public.tactical_published_overrides(',
   'source_batch_id,source_row,dependency,development_close,tests_close,gsj_validation,',
   'considerations,situational_history,published_by,published_at)',
   'VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,now())',
   'ON CONFLICT(source_batch_id,source_row) DO UPDATE SET',
   'dependency=EXCLUDED.dependency,development_close=EXCLUDED.development_close,',
   'tests_close=EXCLUDED.tests_close,gsj_validation=EXCLUDED.gsj_validation,',
   'considerations=EXCLUDED.considerations,situational_history=EXCLUDED.situational_history,',
   'published_by=EXCLUDED.published_by,published_at=now()'
  ].join(' ');
  for(const c of changes.values()){
   await client.query(insertSql,[
    batchId,c.row.source_row,c.after.dependency,c.after.development_close,c.after.test_close,
    c.after.validation_close,c.after.considerations,c.history,user.email]);
   for(const proposalId of c.proposalIds){
    await client.query(
     'INSERT INTO integraciones_laboral.dashboard_published_proposals '+
     '(proposal_id,publication_id,source_batch_id,source_row) VALUES($1,$2::uuid,$3::uuid,$4)',
    [proposalId,publicationId,batchId,c.row.source_row]);
   }
  }
  await client.query('COMMIT');
  return NextResponse.json({published:true,publicationId,batchId,rowsChanged:changes.size,
   proposalsApplied:proposals.length,
   message:'Publicación completada. El dashboard y la exportación leerán estos cambios desde Neon.'},
   {headers:{'Cache-Control':'no-store'}});
 }catch(e){
  await client.query('ROLLBACK');
  const code=(e as {code?:string})?.code;
  if(code==='23505')return error('Conflicto de publicación; actualiza antes de repetir.',409);
  return error(cleanError(e),500);
 }finally{client.release()}
}
