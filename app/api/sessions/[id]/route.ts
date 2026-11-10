import {NextRequest,NextResponse} from 'next/server';
import {authorized} from '../../../../lib/security';
import {db,cleanError} from '../../../../lib/db';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 if(!await authorized(req))return NextResponse.json({error:'Acceso no autorizado'},{status:401});
 const {id}=await params;const eventId=Number(id);
 if(!Number.isSafeInteger(eventId)||eventId<1)return NextResponse.json({error:'ID inválido'},{status:400});
 try{
  const [e,s,f]=await Promise.all([
   db().query('SELECT * FROM integraciones_laboral.calendar_events WHERE id=$1',[eventId]),
   db().query('SELECT s.id,s.file_id,s.title,s.source_url,s.mime_type,s.google_modified_at,s.read_status,s.read_at,s.error_detail,s.processed_chunks,s.total_chunks,r.summary_status AS chatgpt_summary_status FROM integraciones_laboral.calendar_event_sources s LEFT JOIN integraciones_laboral.chatgpt_source_reviews r ON r.file_id=s.file_id AND (r.source_modified_at IS NULL OR s.google_modified_at IS NULL OR r.source_modified_at>=s.google_modified_at) WHERE s.event_id=$1 ORDER BY s.id',[eventId]),
   db().query('SELECT f.id,f.happened_on,f.detail,f.agreement,f.pending,f.owner_team,f.proposed_status,f.evidence_excerpt,f.review_status,f.created_at,i.name AS integration,s.source_url FROM integraciones_laboral.integration_findings f JOIN integraciones_laboral.integrations i ON i.id=f.integration_id JOIN integraciones_laboral.calendar_event_sources s ON s.id=f.source_id WHERE f.event_id=$1 ORDER BY f.created_at DESC,f.id DESC',[eventId])
  ]);
  if(!e.rowCount)return NextResponse.json({error:'Sesión no encontrada'},{status:404});
  return NextResponse.json({event:e.rows[0],sources:s.rows,findings:f.rows},{headers:{'Cache-Control':'no-store'}});
 }catch(err){return NextResponse.json({error:cleanError(err)},{status:500})}
}
