import {createHash} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {authorized} from '../../../../lib/security';
import {db,cleanError} from '../../../../lib/db';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const normalized=(s:string)=>s.replace(/\s+/g,' ').trim().toLocaleLowerCase('es');
const dateValid=(v:string)=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
 const d=new Date(v+'T12:00:00.000Z');
 return Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===v;
};
const field=(data:Record<string,unknown>,name:string,max:number)=>{
 const value=data[name];
 if(typeof value!=='string'||value.length>max)return null;
 return value.trim();
};

/** Solo edita propuestas sin decidir; ni el Excel ni la bitácora operativa son modificados. */
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const user=await authorized(req);
 if(!user)return NextResponse.json({error:'No autorizado'},{status:401});
 const id=Number((await params).id);
 if(!Number.isSafeInteger(id)||id<1)return NextResponse.json({error:'Identificador de propuesta inválido'},{status:400});
 const body=await req.json().catch(()=>null);
 if(!body||typeof body!=='object'||Array.isArray(body))
  return NextResponse.json({error:'Se requiere un registro válido'},{status:400});
 const input=body as Record<string,unknown>;
 const integrationId=Number(input.integrationId);
 const observedOn=field(input,'observedOn',10);
 const detail=field(input,'detail',3500);
 const agreement=field(input,'agreement',2400);
 const pending=field(input,'pending',2400);
 const responsible=field(input,'responsible',150);
 const sourceName=field(input,'sourceName',500);
 const sourceUrl=field(input,'sourceUrl',1500);
 const evidenceQuote=field(input,'evidenceQuote',4000);
 const expectedFingerprint=field(input,'expectedFingerprint',128);
 const reason=field(input,'reason',600);
 if(!Number.isSafeInteger(integrationId)||integrationId<1||
    !observedOn||!dateValid(observedOn)||detail===null||detail.length<15||
    agreement===null||pending===null||responsible===null||sourceName===null||sourceName.length<3||
    sourceUrl===null||evidenceQuote===null||!expectedFingerprint||reason===null){
  return NextResponse.json({error:'Revisa integración, fecha, texto del hecho (mínimo 15 caracteres) y fuente.'},{status:400});
 }
 if(pending&&(!responsible||responsible==='Por determinar'))
  return NextResponse.json({error:'El pendiente requiere un responsable específico.'},{status:400});
 if(sourceUrl&&(!/^https:\/\/[^/\s]+\.[^/\s]+/i.test(sourceUrl)||/\s/.test(sourceUrl)))
  return NextResponse.json({error:'El enlace a la fuente debe ser HTTPS válido.'},{status:400});
 if(!sourceUrl&&evidenceQuote.length<15)
  return NextResponse.json({error:'Indica un enlace HTTPS o una cita verificable de al menos 15 caracteres.'},{status:400});
 const fingerprint=createHash('sha256').update([
  'guiado-v1',integrationId,observedOn,normalized(detail),normalized(agreement),
  normalized(pending),normalized(responsible)
 ].join('|')).digest('hex');

 const client=await db().connect();
 try{
  await client.query('BEGIN');
  const found=await client.query(
   'SELECT * FROM integraciones_laboral.chatgpt_review_proposals WHERE id=$1 FOR UPDATE',[id]);
  if(!found.rowCount){await client.query('ROLLBACK');return NextResponse.json({error:'Propuesta no encontrada'},{status:404});}
  const old=found.rows[0];
  if(old.review_status!=='Propuesto'){
   await client.query('ROLLBACK');
   return NextResponse.json({error:'Solo se pueden editar propuestas sin aprobar o rechazar.'},{status:409});
  }
  if(old.fingerprint!==expectedFingerprint){
   await client.query('ROLLBACK');
   return NextResponse.json({error:'La propuesta cambió en otra sesión. Actualiza la lista y revisa de nuevo.'},{status:409});
  }
  const published=await client.query(
   "SELECT t.situational_history AS history FROM integraciones_laboral.integrations i "+
   "JOIN public.tactical_tracking t ON LOWER(BTRIM(t.integration_name))=LOWER(BTRIM(i.name)) AND t.is_active=TRUE "+
   "JOIN public.migration_source_controls c ON c.module_key='resumen_tactico' AND c.active_source='neon' "+
   "AND c.neon_read_enabled=TRUE AND t.source_batch_id=c.published_batch_id "+
   'WHERE i.id=$1',[integrationId]);
  if(!published.rowCount){
   await client.query('ROLLBACK');
   return NextResponse.json({error:'La integración no tiene una fila en el Excel publicado.'},{status:409});
  }
  const line=observedOn.slice(8,10)+'/'+observedOn.slice(5,7)+' - '+detail+
   (agreement?' | Acuerdo: '+agreement:'')+
   (pending?' | Pendiente: '+responsible+': '+pending:'');
  if(String(published.rows[0].history||'').split(/\r?\n/).some(s=>normalized(s)===normalized(line))){
   await client.query('ROLLBACK');
   return NextResponse.json({error:'La anotación ya existe en la columna G publicada.'},{status:409});
  }
  const duplicate=await client.query(
   "SELECT id FROM integraciones_laboral.chatgpt_review_proposals "+
   "WHERE id<>$1 AND integration_id=$2 AND observed_on=$3::date "+
   "AND lower(btrim(detail))=lower(btrim($4)) AND lower(btrim(agreement))=lower(btrim($5)) "+
   "AND lower(btrim(pending))=lower(btrim($6)) AND lower(btrim(responsible))=lower(btrim($7)) LIMIT 1",
   [id,integrationId,observedOn,detail,agreement,pending,responsible||'Por determinar']);
  if(duplicate.rowCount){
   await client.query('ROLLBACK');
   return NextResponse.json({error:'Ya existe otra propuesta equivalente para esa fecha e integración.'},{status:409});
  }
  const before={
   integration_id:String(old.integration_id),observed_on:old.observed_on instanceof Date?old.observed_on.toISOString().slice(0,10):String(old.observed_on).slice(0,10),
   detail:old.detail,agreement:old.agreement,pending:old.pending,responsible:old.responsible,
   source_name:old.source_name,source_url:old.source_url,evidence_quote:old.evidence_quote,
   fingerprint:old.fingerprint
  };
  const after={
   integration_id:String(integrationId),observed_on:observedOn,detail,agreement,pending,
   responsible:responsible||'Por determinar',source_name:sourceName,source_url:sourceUrl,
   evidence_quote:evidenceQuote,fingerprint
  };
  if(Object.keys(after).every(k=>String(after[k as keyof typeof after])===String(before[k as keyof typeof before]))){
   await client.query('COMMIT');
   return NextResponse.json({success:true,changed:false,message:'No hay cambios para guardar.'});
  }
  await client.query(
   "UPDATE integraciones_laboral.chatgpt_review_proposals SET "+
   "integration_id=$1,observed_on=$2::date,detail=$3,agreement=$4,pending=$5,responsible=$6,"+
   "source_name=$7,source_url=$8,evidence_quote=$9,fingerprint=$10 WHERE id=$11 AND review_status='Propuesto'",
   [integrationId,observedOn,detail,agreement,pending,responsible||'Por determinar',
    sourceName,sourceUrl,evidenceQuote,fingerprint,id]);
  await client.query(
   "INSERT INTO integraciones_laboral.chatgpt_proposal_edit_audit "+
   "(proposal_id,before_data,after_data,actor_email,reason) VALUES($1,$2::jsonb,$3::jsonb,$4,$5)",
   [id,JSON.stringify(before),JSON.stringify(after),user.email,reason]);
  await client.query('COMMIT');
  return NextResponse.json({
   success:true,changed:true,publishedToExcel:false,
   message:'Propuesta editada y auditada. No se modificó el Excel ni el dashboard.'
  },{headers:{'Cache-Control':'no-store'}});
 }catch(e){
  await client.query('ROLLBACK');
  const code=(e as {code?:string})?.code;
  if(code==='23505')return NextResponse.json({error:'Ya existe una propuesta con estos datos.'},{status:409});
  return NextResponse.json({error:cleanError(e)},{status:500});
 }finally{client.release();}
}
