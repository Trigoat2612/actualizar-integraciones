import {NextRequest,NextResponse} from 'next/server';
import {authorized} from '../../../lib/security';
import {db,cleanError} from '../../../lib/db';
import {validDate,dayAfter} from '../../../lib/google';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 if(!await authorized(req))return NextResponse.json({error:'Acceso no autorizado'},{status:401});
 try{
  const p=req.nextUrl.searchParams;
  const from=p.get('from')||'2026-10-01',to=p.get('to')||'2026-11-09';
  if(!validDate(from)||!validDate(to)||from>to)return NextResponse.json({error:'Periodo inválido'},{status:400});
  const found=await db().query(
   'SELECT e.id,e.event_id,e.title,e.start_at,e.end_at,e.event_url,e.event_status,e.last_seen_at,COUNT(DISTINCT s.id)::int AS source_count,COUNT(DISTINCT s.id) FILTER (WHERE s.read_status = $3)::int AS read_count,COUNT(DISTINCT s.id) FILTER (WHERE s.mime_type LIKE $4)::int AS video_count,COUNT(DISTINCT f.id)::int AS findings_count,STRING_AGG(DISTINCT i.name,$5) AS integrations FROM integraciones_laboral.calendar_events e LEFT JOIN integraciones_laboral.calendar_event_sources s ON s.event_id=e.id LEFT JOIN integraciones_laboral.integration_findings f ON f.event_id=e.id AND f.review_status IN ($6,$7) LEFT JOIN integraciones_laboral.integrations i ON i.id=f.integration_id WHERE e.start_at >= $1::timestamptz AND e.start_at < $2::timestamptz GROUP BY e.id ORDER BY e.start_at DESC LIMIT 500',
   [from+'T00:00:00-05:00',dayAfter(to)+'T00:00:00-05:00','Leída','video/%',', ','Propuesto','Aprobado']);
  const integrations=await db().query('SELECT id,source_numero,name,status,dependency,criticality,updated_at FROM integraciones_laboral.integrations ORDER BY numero');
  const recent=await db().query('SELECT id,requested_from,requested_to,mode,found_events,created_at,status FROM integraciones_laboral.analysis_batches ORDER BY id DESC LIMIT 20');
  return NextResponse.json({sessions:found.rows,integrations:integrations.rows,batches:recent.rows},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({error:cleanError(e)},{status:500})}
}
