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
  const params=req.nextUrl.searchParams;
  const from=params.get('from')||'2026-11-04',to=params.get('to')||from;
  if(!validDate(from)||!validDate(to)||from>to)return NextResponse.json({error:'Rango inválido'},{status:400});
  const page=Math.max(1,Math.min(100000,Number(params.get('page')||'1')||1));
  const pageSize=Math.max(1,Math.min(20,Number(params.get('pageSize')||'8')||8));
  const search=(params.get('q')||'').trim().slice(0,120);
  const status=params.get('status')||'Todos';
  if(!['Todos',...statuses].includes(status))return NextResponse.json({error:'Filtro de estado inválido'},{status:400});
  const pool=db();
  const v=(await pool.query('SELECT id,source_filename,imported_at FROM '+schema+'.baseline_versions WHERE active=true')).rows[0];
  if(!v)return NextResponse.json({baselineReady:false,sessions:[],counts:{total:0},total:0,page,pageSize,message:'Importa primero el Excel de línea base'});
  const bounds=[from+'T00:00:00-05:00',dayAfter(to)+'T00:00:00-05:00',v.id];
  const effective="CASE WHEN r.baseline_version_id IS NOT NULL AND r.baseline_version_id <> $3::bigint THEN 'Por cotejar' ELSE COALESCE(r.status,'Por cotejar') END";
  const baseWhere="e.start_at >= $1::timestamptz AND e.start_at < $2::timestamptz";
  const join=" FROM "+schema+".calendar_events e LEFT JOIN "+schema+".calendar_reconciliations r ON r.event_id=e.id";
  const [summary,filtered,events]=await Promise.all([
   pool.query('SELECT '+effective+" AS status,COUNT(*)::int AS count"+join+' WHERE '+baseWhere+' GROUP BY 1',bounds),
   pool.query('SELECT COUNT(*)::int AS n'+join+' WHERE '+baseWhere+" AND ($4='Todos' OR "+effective+"=$4) AND ($5='' OR e.title ILIKE '%'||$5||'%')",[...bounds,status,search]),
   pool.query(`SELECT e.id,e.title,e.start_at,e.event_url,e.event_status,
     ${effective} AS coverage_status,r.notes,r.checked_at,r.checked_by,
     r.baseline_version_id,r.integration_ids,
     (SELECT COUNT(*)::int FROM ${schema}.calendar_event_sources s WHERE s.event_id=e.id) AS source_count,
     (SELECT COUNT(*)::int FROM ${schema}.calendar_event_sources s WHERE s.event_id=e.id AND s.mime_type LIKE 'video/%') AS video_count,
     COALESCE((SELECT json_agg(json_build_object('id',s.id,'title',s.title,'url',s.source_url,'mime',s.mime_type) ORDER BY s.id)
       FROM ${schema}.calendar_event_sources s WHERE s.event_id=e.id AND s.mime_type NOT LIKE 'video/%'),'[]'::json) AS documents
     ${join} WHERE ${baseWhere} AND ($4='Todos' OR ${effective}=$4)
     AND ($5='' OR e.title ILIKE '%'||$5||'%')
     ORDER BY e.start_at DESC,e.id DESC LIMIT $6 OFFSET $7`,
    [...bounds,status,search,pageSize,(page-1)*pageSize])
  ]);
  const counts:Record<string,number>={total:0,'Por cotejar':0,'Cubierta en base':0,'Omisión detectada':0,'Fuera de alcance':0};
  for(const r of summary.rows){counts[String(r.status)]=Number(r.count);counts.total+=Number(r.count)}
  return NextResponse.json({baselineReady:true,baseline:v,from,to,total:Number(filtered.rows[0].n),counts,page,pageSize,
   sessions:events.rows.map(e=>({...e,requiresRecheck:!!e.baseline_version_id&&Number(e.baseline_version_id)!==Number(v.id)})),
   warning:'Cada cotejo requiere revisar la sesión y el registro concreto de la bitácora; una fecha coincidente no acredita cobertura.'},
   {headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({error:cleanError(e)},{status:500})}
}
export async function POST(req:NextRequest){
 const user=await authorized(req);if(!user)return NextResponse.json({error:'No autorizado'},{status:401});
 try{
  const body=await req.json();
  const eventId=Number(body.eventId),status=String(body.status||''),notes=String(body.notes||'').trim(),
    integrationIds:number[]=Array.isArray(body.integrationIds)?Array.from(new Set<number>(body.integrationIds.map((v:unknown)=>Number(v)))):[];
  if(!Number.isSafeInteger(eventId)||eventId<1||!statuses.includes(status))
   return NextResponse.json({error:'Evento o estado inválido'},{status:400});
  if(status!=='Por cotejar'&&notes.length<15)return NextResponse.json({error:'Indica el fundamento del cotejo (mínimo 15 caracteres)'},{status:400});
  if(['Cubierta en base','Omisión detectada'].includes(status)&&integrationIds.length===0)
   return NextResponse.json({error:'Selecciona al menos una integración realmente tratada en la sesión'},{status:400});
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
