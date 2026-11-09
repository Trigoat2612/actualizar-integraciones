import {NextRequest,NextResponse} from 'next/server';
import {authorized} from '../../../../../lib/security';
import {db,cleanError} from '../../../../../lib/db';
import {createHash} from 'node:crypto';
export const runtime='nodejs';
const sum=(v:string)=>createHash('sha256').update(v).digest('hex');
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const user=await authorized(req);
 if(!user)return NextResponse.json({error:'No autorizado'},{status:401});
 const id=Number((await params).id);
 if(!Number.isSafeInteger(id)||id<1)return NextResponse.json({error:'ID de hallazgo inválido'},{status:400});
 const body=await req.json().catch(()=>({}));
 const decision=body.decision;
 if(!['Aprobado','Rechazado'].includes(decision)||body.confirm!==true)
  return NextResponse.json({error:'Se requiere aprobación o rechazo explícito'},{status:400});
 const reason=String(body.reason||'').slice(0,1000);
 const client=await db().connect();
 try{
  await client.query('BEGIN');
  const r=await client.query(
   "SELECT f.*,e.title AS event_title,s.source_url,i.name AS integration FROM integraciones_laboral.integration_findings f JOIN integraciones_laboral.calendar_events e ON e.id=f.event_id JOIN integraciones_laboral.calendar_event_sources s ON s.id=f.source_id JOIN integraciones_laboral.integrations i ON i.id=f.integration_id WHERE f.id=$1 FOR UPDATE OF f",[id]);
  if(!r.rowCount){await client.query('ROLLBACK');return NextResponse.json({error:'Hallazgo no encontrado'},{status:404})}
  const f=r.rows[0];
  if(f.review_status!=='Propuesto'){await client.query('ROLLBACK');return NextResponse.json({error:'Este hallazgo ya fue atendido o está desactualizado'},{status:409})}
  const current=await client.query('SELECT sha256,read_status FROM integraciones_laboral.calendar_event_sources WHERE id=$1',[f.source_id]);
  if(!current.rowCount||current.rows[0].sha256!==f.source_sha256||current.rows[0].read_status!=='Leída'){
   await client.query('ROLLBACK');return NextResponse.json({error:'La fuente no ha sido revisada por completo o fue modificada'},{status:409});
  }
  if(decision==='Aprobado'){
   const sourceName=String(f.event_title||'Sesión')+' | '+String(f.source_url||'');
   const runId=(await client.query(
    'INSERT INTO integraciones_laboral.review_runs(source_name,source_sha256,scope,approved_count) VALUES($1,$2,$3,0) RETURNING id',
    [sourceName.slice(0,500),f.source_sha256,f.integration])).rows[0].id;
   const observed=String(f.happened_on instanceof Date?f.happened_on.toISOString().slice(0,10):f.happened_on).slice(0,10);
   const fp=sum([f.integration_id,observed,f.fingerprint].join('|'));
   const inserted=await client.query(
    'INSERT INTO integraciones_laboral.observations(integration_id,run_id,observed_on,happened,agreement,pending,responsible,proposed_status,source_name,source_sha256,evidence_quote,fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(fingerprint) DO NOTHING RETURNING id',
    [f.integration_id,runId,f.happened_on,f.detail,f.agreement,f.pending,f.owner_team,f.proposed_status,sourceName,f.source_sha256,f.evidence_excerpt,fp]);
   if(inserted.rowCount){
    const entry=observed.slice(8,10)+'/'+observed.slice(5,7)+' - '+f.detail+
     (f.agreement?' | Acuerdo: '+f.agreement:'')+
     (f.pending?' | Pendiente: '+(f.owner_team||'Responsable por confirmar')+': '+f.pending:'');
    await client.query(
     "UPDATE integraciones_laboral.integrations SET situational_log=CASE WHEN situational_log='' THEN $1 ELSE situational_log||E'\\n'||$1 END,updated_at=NOW() WHERE id=$2",
     [entry,f.integration_id]);
    await client.query('UPDATE integraciones_laboral.review_runs SET approved_count=1 WHERE id=$1',[runId]);
   }
  }
  await client.query('UPDATE integraciones_laboral.integration_findings SET review_status=$2 WHERE id=$1',[id,decision]);
  await client.query('INSERT INTO integraciones_laboral.approval_audit(finding_id,decision,reason,actor_email) VALUES($1,$2,$3,$4)',[id,decision,reason,user.email]);
  await client.query('COMMIT');
  return NextResponse.json({success:true,decision,approvedId:id});
 }catch(e){await client.query('ROLLBACK');return NextResponse.json({error:cleanError(e)},{status:500})}
 finally{client.release()}
}
