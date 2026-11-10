import {NextRequest,NextResponse} from 'next/server';
import {authorized} from '../../../../../lib/security';
import {db,cleanError} from '../../../../../lib/db';
export const runtime='nodejs';
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const user=await authorized(req);if(!user)return NextResponse.json({error:'No autorizado'},{status:401});
 const id=Number((await params).id);if(!Number.isSafeInteger(id)||id<1)return NextResponse.json({error:'ID inválido'},{status:400});
 const body=await req.json().catch(()=>({}));
 const decision=String(body.decision||''),reason=String(body.reason||'').trim().slice(0,1000);
 if(!['Aprobado','Rechazado'].includes(decision)||body.confirm!==true)return NextResponse.json({error:'Se requiere una decisión explícita'},{status:400});
 const client=await db().connect();
 try{
  await client.query('BEGIN');
  const finding=await client.query('SELECT p.*,i.name AS integration FROM integraciones_laboral.chatgpt_review_proposals p JOIN integraciones_laboral.integrations i ON i.id=p.integration_id WHERE p.id=$1 FOR UPDATE OF p',[id]);
  if(!finding.rowCount){await client.query('ROLLBACK');return NextResponse.json({error:'Propuesta no encontrada'},{status:404})}
  const p=finding.rows[0];
  if(p.review_status!=='Propuesto'){await client.query('ROLLBACK');return NextResponse.json({error:'La propuesta ya fue decidida'},{status:409})}
  if(decision==='Aprobado'){
   const day=new Date(p.observed_on).toISOString().slice(0,10);
   const text=day.slice(8,10)+'/'+day.slice(5,7)+' - '+p.detail+
    (p.agreement?' | Acuerdo: '+p.agreement:'')+
    (p.pending?' | Pendiente: '+(p.responsible||'Por determinar')+': '+p.pending:'');
   const row=await client.query('SELECT situational_log FROM integraciones_laboral.integrations WHERE id=$1 FOR UPDATE',[p.integration_id]);
   const log=String(row.rows[0]?.situational_log||'');
   const exist=log.split(/\r?\n/).some(line=>line.trim()===text.trim());
   if(!exist){
    await client.query('UPDATE integraciones_laboral.integrations SET situational_log=CASE WHEN situational_log=$1 THEN $2 ELSE situational_log||E\'\\n\'||$2 END,updated_at=NOW() WHERE id=$3',
     ['',text,p.integration_id]);
   }
  }
  await client.query('UPDATE integraciones_laboral.chatgpt_review_proposals SET review_status=$1,approved_at=CASE WHEN $1=$2 THEN NOW() ELSE NULL END WHERE id=$3',
   [decision,'Aprobado',id]);
  await client.query('INSERT INTO integraciones_laboral.chatgpt_proposal_audit(proposal_id,decision,reason,actor_email) VALUES($1,$2,$3,$4)',
   [id,decision,reason,user.email]);
  await client.query('COMMIT');
  return NextResponse.json({success:true,decision,id});
 }catch(e){await client.query('ROLLBACK');return NextResponse.json({error:cleanError(e)},{status:500})}finally{client.release()}
}
