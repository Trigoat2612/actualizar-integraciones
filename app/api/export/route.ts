import {NextRequest,NextResponse} from 'next/server';
import {authorized} from '../../../lib/security';
import {db,cleanError} from '../../../lib/db';
import ExcelJS from 'exceljs';
export const runtime='nodejs';export const maxDuration=120;
function safe(v:unknown){
 if(v instanceof Date)return v.toISOString().slice(0,10);
 const s=String(v??'');return /^[=+\-@\t\r]/.test(s)?"'"+s:s;
}
function header(ws:ExcelJS.Worksheet,labels:string[]){
 ws.addRow(labels);
 ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
 ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF173B59'}};
 ws.views=[{state:'frozen',ySplit:1}];
 ws.columns.forEach((c,i)=>{c.width=i===labels.length-1?65:Math.min(45,Math.max(18,labels[i].length+9))});
 ws.autoFilter={from:'A1',to:{row:1,column:labels.length}};
}
export async function GET(req:NextRequest){
 if(!await authorized(req))return NextResponse.json({error:'No autorizado'},{status:401});
 try{
  const pool=db();
  const [cat,events,sources,findings,audit]=await Promise.all([
   pool.query('SELECT source_numero,name,status,dependency,criticality,situational_log FROM integraciones_laboral.integrations ORDER BY numero'),
   pool.query('SELECT id,title,start_at,event_url,event_status,last_seen_at FROM integraciones_laboral.calendar_events ORDER BY start_at DESC LIMIT 5000'),
   pool.query('SELECT e.title AS session,e.start_at,s.title,s.source_url,s.mime_type,s.read_status,s.processed_chunks,s.total_chunks,s.error_detail FROM integraciones_laboral.calendar_event_sources s JOIN integraciones_laboral.calendar_events e ON e.id=s.event_id ORDER BY e.start_at DESC LIMIT 15000'),
   pool.query('SELECT i.name AS integration,e.title AS session,f.happened_on,f.detail,f.agreement,f.pending,f.owner_team,f.proposed_status,f.review_status,f.evidence_excerpt,s.source_url FROM integraciones_laboral.integration_findings f JOIN integraciones_laboral.calendar_events e ON e.id=f.event_id JOIN integraciones_laboral.integrations i ON i.id=f.integration_id JOIN integraciones_laboral.calendar_event_sources s ON s.id=f.source_id ORDER BY f.happened_on DESC,f.id DESC LIMIT 15000'),
   pool.query('SELECT a.finding_id,a.decision,a.reason,a.actor_email,a.created_at FROM integraciones_laboral.approval_audit a ORDER BY a.id DESC LIMIT 10000')
  ]);
  const book=new ExcelJS.Workbook();book.creator='Actualizador de Integraciones EJE No Penal';
  const tabs=[
   {name:'Seguimiento',labels:['N°','Sistema a Integrar','Estado','Dependencia','Criticidad','Estado Situacional'],rows:cat.rows.map(r=>[r.source_numero,r.name,r.status,r.dependency,r.criticality,r.situational_log])},
   {name:'Sesiones revisadas',labels:['ID','Sesión','Inicio (UTC)','Evento Calendar','Estado Calendar','Última detección'],rows:events.rows.map(r=>[r.id,r.title,r.start_at,r.event_url,r.event_status,r.last_seen_at])},
   {name:'Fuentes',labels:['Sesión','Inicio (UTC)','Documento','URL','Tipo','Lectura','Fragmentos procesados','Total fragmentos','Error'],rows:sources.rows.map(r=>[r.session,r.start_at,r.title,r.source_url,r.mime_type,r.read_status,r.processed_chunks,r.total_chunks,r.error_detail])},
   {name:'Historial por integración',labels:['Integración','Sesión','Fecha','Hecho','Acuerdo','Pendiente','Responsable','Estado propuesto','Revisión','Cita de evidencia','URL fuente'],rows:findings.rows.map(r=>[r.integration,r.session,r.happened_on,r.detail,r.agreement,r.pending,r.owner_team,r.proposed_status,r.review_status,r.evidence_excerpt,r.source_url])},
   {name:'Pendientes',labels:['Integración','Sesión','Fecha','Pendiente','Responsable','Revisión','URL evidencia'],rows:findings.rows.filter(r=>r.pending&&r.review_status==='Aprobado').map(r=>[r.integration,r.session,r.happened_on,r.pending,r.owner_team,r.review_status,r.source_url])},
   {name:'Auditoría',labels:['Hallazgo ID','Decisión','Motivo','Responsable aprobación','Fecha'],rows:audit.rows.map(r=>[r.finding_id,r.decision,r.reason,r.actor_email,r.created_at])}
  ];
  for(const t of tabs){
   const ws=book.addWorksheet(t.name);header(ws,t.labels);
   for(const values of t.rows)ws.addRow(values.map(safe));
   ws.eachRow((row,i)=>{if(i>1){row.alignment={vertical:'top',wrapText:true};row.height=30}});
  }
  const buffer=await book.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer as ArrayBuffer),{headers:{
   'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
   'Content-Disposition':'attachment; filename="Seguimiento_EJE_Laboral_Neon.xlsx"',
   'Cache-Control':'no-store'
  }});
 }catch(e){return NextResponse.json({error:cleanError(e)},{status:500})}
}
