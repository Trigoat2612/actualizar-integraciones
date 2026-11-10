import {NextRequest,NextResponse} from 'next/server';
import {authorized} from '../../../lib/security';
import {db,cleanError} from '../../../lib/db';
import {validDate,dayAfter} from '../../../lib/google';
export const runtime='nodejs';export const dynamic='force-dynamic';
const schema='integraciones_laboral';
const statuses=['Por cotejar','Cubierta en base','Omisión detectada','Fuera de alcance'];
export async function GET(req:NextRequest){
 const user=await authorized(req);if(!user)return NextResponse.json({error:'No autorizado'},{status:401});
 try{
  const from=req.nextUrl.searchParams.get('from')||'2026-11-04',to=req.nextUrl.searchParams.get('to')||from;
  if(!validDate(from)||!validDate(to)||from>to)return NextResponse.json({error:'Rango inválido'},{status:400});
  const pool=db();
  const v=(await pool.query('SELECT id,source_filename,imported_at FROM '+schema+'.baseline_versions WHERE active=true')).rows[0];
  if(!v)return NextResponse.json({baselineReady:false,sessions:[],message:'Importa primero el Excel de línea base'});
  const [events,rows,totals]=await Promise.all([
   pool.query('SELECT e.id,e.title,e.start_at,e.event_url,e.event_status,COALESCE(r.status,$3) AS coverage_status,r.notes,r.checked_at,r.checked_by,r.baseline_version_id,r.integration_ids,COUNT(DISTINCT s.id)::int AS source_count,COUNT(DISTINCT s.id) FILTER (WHERE s.mime_type LIKE $4)::int AS video_count FROM '+schema+'.calendar_events e LEFT JOIN '+schema+'.calendar_reconciliations r ON r.event_id=e.id LEFT JOIN '+schema+'.calendar_event_sources s ON s.event_id=e.id WHERE e.start_at >= $1::timestamptz AND e.start_at < $2::timestamptz GROUP BY e.id,r.status,r.notes,r.checked_at,r.checked_by,r.baseline_version_id,r.integration_ids ORDER BY e.start_at,e.id',[from+'T00:00:00-05:00',dayAfter(to)+'T00:00:00-05:00','Por cotejar','video/%']),
   pool.query('SELECT r.integration_id,r.source_name,r.situational_log,i.name FROM '+schema+'.baseline_integration_rows r JOIN '+schema+'.integrations i ON i.id=r.integration_id WHERE r.version_id=$1 ORDER BY i.numero',[v.id]),
   pool.query('SELECT COUNT(*)::int AS n FROM '+schema+'.calendar_events WHERE start_at >= $1::timestamptz AND start_at < $2::timestamptz',[from+'T00:00:00-05:00',dayAfter(to)+'T00:00:00-05:00'])
  ]);
  const candidates=events.rows.map(e=>{
   const local=new Date(e.start_at).toLocaleDateString('en-GB',{timeZone:'America/Lima',day:'2-digit',month:'2-digit',year:'numeric'});
   const ddmm=local.slice(0,5);
   const possible=rows.rows.filter(r=>new RegExp('(?:^|\\s)'+ddmm.replace('/','\\/')+'\\s*-').test(String(r.situational_log||'')));
   return {...e,baselinePossible:possible.map(r=>({id:Number(r.integration_id),name:r.name})),autoConfirmed:false,
    requiresRecheck:e.baseline_version_id&&Number(e.baseline_version_id)!==Number(v.id)};
  });
  return NextResponse.json({baselineReady:true,baseline:v,from,to,total:totals.rows[0].n,sessions:candidates,
   warning:'Una coincidencia de fecha en la bitácora solo sugiere cobertura; no confirma que se haya revisado esta sesión exacta.'},
   {headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({error:cleanError(e)},{status:500})}
}
export async function POST(req:NextRequest){
 const user=await authorized(req);if(!user)return NextResponse.json({error:'No autorizado'},{status:401});
 try{
  const body=await req.json();
  const eventId=Number(body.eventId),status=String(body.status||''),notes=String(body.notes||'').trim(),
    integrationIds=Array.isArray(body.integrationIds)?[...new Set(body.integrationIds.map(Number))]:[];
  if(!Number.isSafeInteger(eventId)||eventId<1||!statuses.includes(status))
   return NextResponse.json({error:'Evento o estado inválido'},{status:400});
  if(status!=='Por cotejar'&&notes.length<15)return NextResponse.json({error:'Indica el fundamento del cotejo (mínimo 15 caracteres)'},{status:400});
  if(integrationIds.some(n=>!Number.isSafeInteger(n)||n<1)||integrationIds.length>35)
   return NextResponse.json({error:'Selección de integraciones inválida'},{status:400});
  const pool=db(),v=(await pool.query('SELECT id FROM '+schema+'.baseline_versions WHERE active=true')).rows[0];
  if(!v)return NextResponse.json({error:'Aún no se ha importado la línea base'},{status:409});
  const [event,match]=await Promise.all([
   pool.query('SELECT id FROM '+schema+'.calendar_events WHERE id=$1',[eventId]),
   pool.query('SELECT integration_id FROM '+schema+'.baseline_integration_rows WHERE version_id=$1 AND integration_id=ANY($2::bigint[])',[v.id,integrationIds])
  ]);
  if(!event.rowCount)return NextResponse.json({error:'Sesión no encontrada'},{status:404});
  if(match.rowCount!==integrationIds.length)return NextResponse.json({error:'Una integración no existe en la línea base'},{status:400});
  const result=await pool.query('INSERT INTO '+schema+'.calendar_reconciliations(event_id,baseline_version_id,status,integration_ids,notes,checked_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(event_id) DO UPDATE SET baseline_version_id=EXCLUDED.baseline_version_id,status=EXCLUDED.status,integration_ids=EXCLUDED.integration_ids,notes=EXCLUDED.notes,checked_by=EXCLUDED.checked_by,checked_at=NOW() RETURNING event_id,status,checked_at',
   [eventId,v.id,status,integrationIds,notes,user.email]);
  return NextResponse.json({saved:true,reconciliation:result.rows[0]},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({error:cleanError(e)},{status:500})}
}
