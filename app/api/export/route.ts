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
  const [cat,events,sources,findings,audit,coverage,proposals,proposalAudit]=await Promise.all([
   pool.query("SELECT i.source_numero,i.name,i.status,i.dependency,i.criticality,i.situational_log,COALESCE(r.observation,'') AS observation,COALESCE(r.environment_enablement,'') AS environment_enablement,COALESCE(r.development_close,'') AS development_close,COALESCE(r.test_close,'') AS test_close,COALESCE(r.validation_close,'') AS validation_close,COALESCE(r.documentation,'') AS documentation,COALESCE(r.considerations,'') AS considerations FROM integraciones_laboral.integrations i LEFT JOIN integraciones_laboral.baseline_integration_rows r ON r.integration_id=i.id AND r.version_id=(SELECT id FROM integraciones_laboral.baseline_versions WHERE active=true LIMIT 1) ORDER BY i.numero"),
   pool.query('SELECT id,title,start_at,event_url,event_status,last_seen_at FROM integraciones_laboral.calendar_events ORDER BY start_at DESC LIMIT 5000'),
   pool.query('SELECT e.title AS session,e.start_at,s.title,s.source_url,s.mime_type,s.read_status,s.processed_chunks,s.total_chunks,s.error_detail FROM integraciones_laboral.calendar_event_sources s JOIN integraciones_laboral.calendar_events e ON e.id=s.event_id ORDER BY e.start_at DESC LIMIT 15000'),
   pool.query('SELECT i.name AS integration,e.title AS session,f.happened_on,f.detail,f.agreement,f.pending,f.owner_team,f.proposed_status,f.review_status,f.evidence_excerpt,s.source_url FROM integraciones_laboral.integration_findings f JOIN integraciones_laboral.calendar_events e ON e.id=f.event_id JOIN integraciones_laboral.integrations i ON i.id=f.integration_id JOIN integraciones_laboral.calendar_event_sources s ON s.id=f.source_id ORDER BY f.happened_on DESC,f.id DESC LIMIT 15000'),
   pool.query('SELECT a.finding_id,a.decision,a.reason,a.actor_email,a.created_at FROM integraciones_laboral.approval_audit a ORDER BY a.id DESC LIMIT 10000'),
   pool.query("SELECT e.title AS session,e.start_at,e.event_url,r.status,r.notes,r.checked_by,r.checked_at,STRING_AGG(DISTINCT i.name,', ') AS integrations FROM integraciones_laboral.calendar_events e LEFT JOIN integraciones_laboral.calendar_reconciliations r ON r.event_id=e.id LEFT JOIN integraciones_laboral.integrations i ON i.id=ANY(COALESCE(r.integration_ids,ARRAY[]::bigint[])) GROUP BY e.id,r.status,r.notes,r.checked_by,r.checked_at ORDER BY e.start_at DESC LIMIT 5000"),
   pool.query('SELECT i.name AS integration,p.observed_on,p.source_name,p.source_url,p.detail,p.agreement,p.pending,p.responsible,p.evidence_quote,p.proposed_status,p.review_status,p.created_at FROM integraciones_laboral.chatgpt_review_proposals p JOIN integraciones_laboral.integrations i ON i.id=p.integration_id ORDER BY p.observed_on DESC,p.id DESC LIMIT 15000'),
   pool.query('SELECT a.proposal_id,a.decision,a.reason,a.actor_email,a.acted_at FROM integraciones_laboral.chatgpt_proposal_audit a ORDER BY a.id DESC LIMIT 10000')
  ]);
  const book=new ExcelJS.Workbook();book.creator='Actualizador de Integraciones EJE No Penal';
  const tabs=[
   {name:'Seguimiento',labels:['N°','Sistema a Integrar','Observación','Estado','Dependencia','Habilitacion de ambiente','Estado Situacional','F. Cierre Desarrollo','F.Cierre Pruebas - Softpla/GTI','F.Validacion GSJ','Documentación','Criticidad','Consideraciones'],rows:cat.rows.map(r=>[r.source_numero,r.name,r.observation,r.status,r.dependency,r.environment_enablement,r.situational_log,r.development_close,r.test_close,r.validation_close,r.documentation,r.criticality,r.considerations])},
   {name:'Sesiones revisadas',labels:['ID','Sesión','Inicio (UTC)','Evento Calendar','Estado Calendar','Última detección'],rows:events.rows.map(r=>[r.id,r.title,r.start_at,r.event_url,r.event_status,r.last_seen_at])},
   {name:'Fuentes',labels:['Sesión','Inicio (UTC)','Documento','URL','Tipo','Lectura','Fragmentos procesados','Total fragmentos','Error'],rows:sources.rows.map(r=>[r.session,r.start_at,r.title,r.source_url,r.mime_type,r.read_status,r.processed_chunks,r.total_chunks,r.error_detail])},
   {name:'Historial por integración',labels:['Integración','Sesión','Fecha','Hecho','Acuerdo','Pendiente','Responsable','Estado propuesto','Revisión','Cita de evidencia','URL fuente'],rows:findings.rows.map(r=>[r.integration,r.session,r.happened_on,r.detail,r.agreement,r.pending,r.owner_team,r.proposed_status,r.review_status,r.evidence_excerpt,r.source_url])},
   {name:'Pendientes',labels:['Integración','Sesión','Fecha','Pendiente','Responsable','Revisión','URL evidencia'],rows:findings.rows.filter(r=>r.pending&&r.review_status==='Aprobado').map(r=>[r.integration,r.session,r.happened_on,r.pending,r.owner_team,r.review_status,r.source_url])},
   {name:'Auditoría',labels:['Hallazgo ID','Decisión','Motivo','Responsable aprobación','Fecha'],rows:audit.rows.map(r=>[r.finding_id,r.decision,r.reason,r.actor_email,r.created_at])},
   {name:'Cotejo Calendar',labels:['Sesión','Fecha y hora','Enlace','Resultado de cotejo','Sustento','Responsable','Fecha revisión','Integraciones relacionadas'],rows:coverage.rows.map(r=>[r.session,r.start_at,r.event_url,r.status||'Por cotejar',r.notes||'',r.checked_by||'',r.checked_at||'',r.integrations||''])},
   {name:'Propuestas ChatGPT',labels:['Integración','Fecha','Sesión o fuente','URL','Hecho','Acuerdo','Pendiente','Responsable','Evidencia','Estado propuesto','Revisión','Registro'],rows:proposals.rows.map(r=>[r.integration,r.observed_on,r.source_name,r.source_url,r.detail,r.agreement,r.pending,r.responsible,r.evidence_quote,r.proposed_status,r.review_status,r.created_at])},
   {name:'Auditoría ChatGPT',labels:['Propuesta ID','Decisión','Motivo','Aprobador','Fecha'],rows:proposalAudit.rows.map(r=>[r.proposal_id,r.decision,r.reason,r.actor_email,r.acted_at])}
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
