import {NextRequest,NextResponse} from 'next/server';
import {authorized} from '../../../lib/security';
import {db,cleanError} from '../../../lib/db';
export const dynamic='force-dynamic';export const runtime='nodejs';
export async function GET(req:NextRequest){
 if(!await authorized(req))return NextResponse.json({error:'No autorizado'},{status:401});
 try{
  const result=await db().query(
   "SELECT f.id,i.name AS integration,e.title AS session,e.start_at,f.happened_on,f.pending,f.owner_team,f.agreement,f.review_status,s.source_url FROM integraciones_laboral.integration_findings f JOIN integraciones_laboral.integrations i ON i.id=f.integration_id JOIN integraciones_laboral.calendar_events e ON e.id=f.event_id JOIN integraciones_laboral.calendar_event_sources s ON s.id=f.source_id WHERE f.pending<>'' AND f.review_status='Aprobado' ORDER BY f.happened_on DESC,f.id DESC LIMIT 1000"
  );
  return NextResponse.json({pending:result.rows},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({error:cleanError(e)},{status:500})}
}
