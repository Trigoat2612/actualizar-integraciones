import {createHash} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {authorized} from '../../../lib/security';
import {db,cleanError} from '../../../lib/db';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 if(!await authorized(req))return NextResponse.json({error:'No autorizado'},{status:401});
 try{
  const pool=db(),p=req.nextUrl.searchParams,from=p.get('from'),to=p.get('to');
  const params:unknown[]=[];let where='';
  if(from&&to){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)
    return NextResponse.json({error:'Fecha inválida'},{status:400});
   where='WHERE p.observed_on >= $1::date AND p.observed_on <= $2::date';params.push(from,to);
  }
  const r=await pool.query('SELECT p.id,p.integration_id,i.name AS integration,p.event_id,p.observed_on,p.source_name,p.source_url,p.detail,p.agreement,p.pending,p.responsible,p.evidence_quote,p.proposed_status,p.source_kind,p.review_status,p.created_at FROM integraciones_laboral.chatgpt_review_proposals p JOIN integraciones_laboral.integrations i ON i.id=p.integration_id '+where+' ORDER BY p.observed_on DESC,p.id DESC LIMIT 1000',params);
  return NextResponse.json({proposals:r.rows,manualApprovalRequired:true},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({error:cleanError(e)},{status:500})}
}


// El ingreso guiado crea propuestas, NUNCA modifica el historial aprobado.
// Cada registro requiere un origen identificable y se valida antes de grabar.
type GuidedEntry={
 observedOn:string;detail:string;agreement?:string;pending?:string;responsible?:string;
};
const limit=(v:unknown,n:number)=>String(v??'').trim().slice(0,n);
const normalized=(v:string)=>v.replace(/\s+/g,' ').trim().toLocaleLowerCase('es');
const validDay=(v:string)=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
 const d=new Date(v+'T12:00:00.000Z');
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;
};
export async function POST(req:NextRequest){
 const user=await authorized(req);
 if(!user)return NextResponse.json({error:'No autorizado'},{status:401});
 try{
  const body=await req.json().catch(()=>null);
  if(!body||typeof body!=='object')return NextResponse.json({error:'Contenido JSON inválido'},{status:400});
  const integrationId=Number(body.integrationId);
  if(!Number.isSafeInteger(integrationId)||integrationId<1)return NextResponse.json({error:'Selecciona una integración'},{status:400});
  const sourceName=limit(body.sourceName,250);
  const sourceUrl=limit(body.sourceUrl,1500);
  const evidenceQuote=limit(body.evidenceQuote,3500);
  if(sourceName.length<5)return NextResponse.json({error:'Identifica la sesión, acta o correo que sustenta el registro'},{status:400});
  if(sourceUrl){
   try{const parsed=new URL(sourceUrl);if(parsed.protocol!=='https:')throw Error('Protocolo no seguro')}
   catch{return NextResponse.json({error:'La fuente debe ser una URL HTTPS válida'},{status:400})}
  }
  if(!sourceUrl&&evidenceQuote.length<15)
   return NextResponse.json({error:'Incluye un enlace a la fuente o una cita verificable de al menos 15 caracteres'},{status:400});
  if(!Array.isArray(body.entries)||body.entries.length<1||body.entries.length>25)
   return NextResponse.json({error:'Ingresa entre 1 y 25 registros por envío'},{status:400});
  const entries:GuidedEntry[]=body.entries.map((v:Record<string,unknown>)=>({
   observedOn:limit(v?.observedOn,10),detail:limit(v?.detail,4000),
   agreement:limit(v?.agreement,2400),pending:limit(v?.pending,2400),
   responsible:limit(v?.responsible,150)
  }));
  for(const [index,e] of entries.entries()){
   if(!validDay(e.observedOn)||e.detail.length<15||e.detail.length>3500)
    return NextResponse.json({error:'Revisa la fecha y el hecho del registro '+(index+1)+' (mínimo 15 caracteres)'},{status:400});
   if(e.pending&&!e.responsible)
    return NextResponse.json({error:'Indica el responsable del pendiente en el registro '+(index+1)},{status:400});
  }
  const client=await db().connect();
  try{
   await client.query('BEGIN');
   const master=await client.query(
    'SELECT id,name,situational_log FROM integraciones_laboral.integrations WHERE id=$1',[integrationId]);
   if(!master.rowCount){await client.query('ROLLBACK');return NextResponse.json({error:'Integración no encontrada'},{status:404})}
   const history=String(master.rows[0].situational_log||'').split(/\r?\n/).map(normalized);
   let created=0,duplicates=0,historical=0;
   const ids:number[]=[];
   for(const entry of entries){
    const day=entry.observedOn;
    const line=day.slice(8,10)+'/'+day.slice(5,7)+' - '+entry.detail+
     (entry.agreement?' | Acuerdo: '+entry.agreement:'')+
     (entry.pending?' | Pendiente: '+entry.responsible+': '+entry.pending:'');
    if(history.includes(normalized(line))){historical++;continue}
    const fingerprint=createHash('sha256')
     .update(['guiado-v1',integrationId,day,normalized(entry.detail),normalized(entry.agreement||''),normalized(entry.pending||''),normalized(entry.responsible||'')].join('|')).digest('hex');
    const r=await client.query(
     "INSERT INTO integraciones_laboral.chatgpt_review_proposals(integration_id,observed_on,source_name,source_url,detail,agreement,pending,responsible,evidence_quote,proposed_status,source_kind,fingerprint) VALUES($1,$2::date,$3,$4,$5,$6,$7,$8,$9,'','Registro guiado',$10) ON CONFLICT(fingerprint) DO NOTHING RETURNING id",
     [integrationId,day,sourceName,sourceUrl,entry.detail,entry.agreement||'',entry.pending||'',entry.responsible||'Por determinar',evidenceQuote,fingerprint]
    );
    if(r.rowCount){created++;ids.push(r.rows[0].id)}
    else duplicates++;
   }
   await client.query('COMMIT');
   return NextResponse.json({created,duplicates,historical,proposalIds:ids,
    message:'Los nuevos registros quedaron como propuestas. La bitácora aprobada sigue intacta.'},
    {headers:{'Cache-Control':'no-store'}});
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
 }catch(e){return NextResponse.json({error:cleanError(e)},{status:500})}
}
