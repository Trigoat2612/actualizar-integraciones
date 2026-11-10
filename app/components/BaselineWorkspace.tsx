'use client';
import {useCallback,useEffect,useState} from 'react';

type Integration={id:number;name:string;source_numero:string};
type Difference={integration:string;number:string;column:string;oldLength:number;newLength:number;oldExcerpt:string;newExcerpt:string};
type Preview={preview:true;rows:number;hash:string;differences:Difference[];canApply:boolean;warning:string};
type Version={id:number;source_filename:string;file_sha256:string;row_count:number;imported_at:string;active:boolean};
type BaselineResponse={versions:Version[];baselineRows:number;coverage:Array<{status:string;total:number}>};
type Candidate={id:number;name:string};
type ReconcileSession={
 id:number;title:string;start_at:string;event_url:string;event_status:string;
 source_count:number;video_count:number;coverage_status:string;notes?:string;
 checked_by?:string;integration_ids?:number[];baselinePossible:Candidate[];
 requiresRecheck:boolean
};
type ReconcileResponse={baselineReady:boolean;sessions:ReconcileSession[];total?:number;warning?:string;message?:string};
type Proposal={
 id:number;integration_id:number;integration:string;event_id:number|null;observed_on:string;
 source_name:string;source_url:string;source_kind:string;detail:string;agreement:string;pending:string;
 responsible:string;evidence_quote:string;proposed_status:string;review_status:string;
};
const STATUSES=['Por cotejar','Cubierta en base','Omisión detectada','Fuera de alcance'];
const local=(s:string)=>new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',dateStyle:'medium',timeStyle:'short'}).format(new Date(s));
async function getJSON<T>(url:string,init?:RequestInit):Promise<T>{
 const result=await fetch(url,{cache:'no-store',...init});
 const data=await result.json();
 if(!result.ok)throw Error(data.error||'Error del servidor');
 return data as T;
}
export default function BaselineWorkspace({from,to,integrations,onRefresh}:{
 from:string;to:string;integrations:Integration[];onRefresh:()=>Promise<void>
}){
 const [baseline,setBaseline]=useState<BaselineResponse|null>(null);
 const [coverage,setCoverage]=useState<ReconcileResponse|null>(null);
 const [proposals,setProposals]=useState<Proposal[]>([]);
 const [file,setFile]=useState<File|null>(null);
 const [preview,setPreview]=useState<Preview|null>(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState(''),[error,setError]=useState('');
 const [edit,setEdit]=useState<Record<number,{status:string;notes:string;selected:number[]}>>({});
 const load=useCallback(async()=>{
  const [a,b,c]=await Promise.all([
   getJSON<BaselineResponse>('/api/baseline'),
   getJSON<ReconcileResponse>('/api/reconciliation?from='+encodeURIComponent(from)+'&to='+encodeURIComponent(to)),
   getJSON<{proposals:Proposal[]}>('/api/proposals?from='+encodeURIComponent(from)+'&to='+encodeURIComponent(to))
  ]);
  setBaseline(a);setCoverage(b);setProposals(c.proposals);
 },[from,to]);
 useEffect(()=>{load().catch(e=>setError(String(e.message||e)));},[load]);
 const active=baseline?.versions.find(v=>v.active);
 const editSession=(s:ReconcileSession)=>{
  return edit[s.id]||{status:s.coverage_status||'Por cotejar',notes:s.notes||'',selected:(s.integration_ids||[]).map(Number)};
 };
 const modify=(id:number,patch:Partial<{status:string;notes:string;selected:number[]}>,s:ReconcileSession)=>{
  setEdit(old=>({...old,[id]:{...editSession(s),...patch}}));
 };
 async function upload(confirmed:boolean){
  if(!file){setError('Selecciona el Excel original');return}
  if(confirmed&&(!preview||!window.confirm('¿Establecer este archivo como línea base oficial de las 35 integraciones? Se conservará una copia de los datos previos.')))return;
  setBusy(true);setError('');setMessage('');
  try{
   const form=new FormData();form.set('file',file);
   if(confirmed&&preview){form.set('confirm','true');form.set('hash',preview.hash)}
   const result=await getJSON<Preview|{imported:boolean;rows:number;differencesApplied:number;backupCreated:boolean}>('/api/baseline',{method:'POST',body:form});
   if('preview' in result){setPreview(result);setMessage('Vista previa lista: '+result.differences.length+' diferencias de campos maestros. Todavía no se ha modificado Neon.')}
   else{setPreview(null);setFile(null);setMessage('Línea base importada: '+result.rows+' integraciones; respaldo previo conservado.');await load();await onRefresh()}
  }catch(e){setError(String(e instanceof Error?e.message:e))}
  finally{setBusy(false)}
 }
 async function saveReconciliation(s:ReconcileSession){
  const v=editSession(s);
  if(v.status!=='Por cotejar'&&v.notes.trim().length<15){setError('Describe la evidencia del cotejo, con al menos 15 caracteres');return}
  setBusy(true);setError('');setMessage('');
  try{
   await getJSON('/api/reconciliation',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({eventId:s.id,status:v.status,notes:v.notes,integrationIds:v.selected})});
   setMessage('Cotejo guardado para: '+s.title);
   await load();
  }catch(e){setError(String(e instanceof Error?e.message:e))}finally{setBusy(false)}
 }
 async function decide(p:Proposal,decision:'Aprobado'|'Rechazado'){
  const sure=window.confirm((decision==='Aprobado'?'¿Aprobar esta propuesta e incorporarla a la bitácora?':'¿Rechazar esta propuesta?')+' '+p.integration);
  if(!sure)return;
  const reason=decision==='Rechazado'?(window.prompt('Justificación del rechazo')||''):'';
  setBusy(true);setError('');setMessage('');
  try{
   await getJSON('/api/proposals/'+p.id+'/decision',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({decision,reason,confirm:true})});
   setMessage('Decisión registrada: '+decision+'.');
   await load();await onRefresh();
  }catch(e){setError(String(e instanceof Error?e.message:e))}finally{setBusy(false)}
 }
 return <div className="workspace">
  <section className="panel">
   <div className="sectionhead"><h2>Línea base oficial de integraciones</h2>
    <button className="light" onClick={()=>load().catch(e=>setError(String(e)))} disabled={busy}>Actualizar datos</button></div>
   <p className="helper">Referencia principal: <b>Lista_Integraciones_base.xlsx</b>, hoja Seguimiento, 35 integraciones. Su redacción original se conserva. No se reconstruyen las bitácoras desde cero.</p>
   {active?<div className="success"><b>Línea base activa · versión {active.id}</b><p>{active.source_filename} · {baseline?.baselineRows} filas conservadas · importada el {local(active.imported_at)}</p></div>
    :<div className="notice">Neon conserva las 35 integraciones iniciales. Falta registrar este archivo como versión oficial auditada; haz una importación controlada para completar la comparación exacta.</div>}
   <div className="toolbar">
    <label className="uploadlabel">Seleccionar Excel original
     <input type="file" accept=".xlsx" onChange={e=>{setFile(e.target.files?.[0]||null);setPreview(null)}}/>
    </label>
    <button className="light" disabled={!file||busy} onClick={()=>upload(false)}>Comparar sin aplicar</button>
   </div>
   {file&&<p className="helper">Archivo seleccionado: {file.name}</p>}
   {preview&&<div className="baseline-preview">
    <h3>Vista previa ({preview.rows} integraciones)</h3>
    <p>{preview.differences.length} diferencias entre el Excel y los campos maestros de Neon. La diferencia de longitud no equivale a contenido faltante, pero ayuda a identificar los registros que requieren atención.</p>
    {preview.differences.length?preview.differences.map((d,i)=><details key={i}><summary>{d.number} · {d.integration} · {d.column} ({d.oldLength} → {d.newLength} caracteres)</summary>
      <p><b>Final actual en Neon:</b> {d.oldExcerpt||'Vacío'}</p><p><b>Final en Excel:</b> {d.newExcerpt||'Vacío'}</p>
     </details>):<p>Los campos maestros coinciden.</p>}
    <p className="helper">{preview.warning}</p>
    <button onClick={()=>upload(true)} disabled={busy}>Confirmar importación con respaldo</button>
   </div>}
  </section>
  {error&&<div className="warn">{error}</div>}
  {message&&<div className="success">{message}</div>}
  <section className="panel">
   <div className="sectionhead"><h2>Cotejo de sesiones de Calendar</h2><span>{from} al {to}</span></div>
   <p className="helper">Se compara la existencia de cada sesión con las referencias de la bitácora, no su contenido completo. Una coincidencia por fecha es <b>solo una pista</b>; debes confirmar la cobertura exacta. Las sesiones sin analizar permanecen visibles.</p>
   {!active&&<p className="notice">Registra la línea base oficial para habilitar el cotejo.</p>}
   {active&&coverage&&coverage.sessions.length===0&&<p className="muted">No se encontraron sesiones registradas en Neon para este rango. Utiliza «Buscar sesiones y registrar avance» para consultar Calendar.</p>}
   {active&&coverage?.sessions.map(s=>{
    const v=editSession(s),baselineMatched=!!s.integration_ids?.length;
    return <article key={s.id} className="reconcile-item">
     <div className="findinghead"><b>{s.title}</b><span>{s.requiresRecheck?'Revisar contra nueva base':s.coverage_status}</span></div>
     <p className="helper">{local(s.start_at)} · {s.source_count} adjuntos identificados · {s.video_count} grabaciones pendientes · <a href={s.event_url} target="_blank" rel="noreferrer">Ver Calendar</a></p>
     {s.baselinePossible.length>0?<p className="helper"><b>Coincidencia de fecha en la base (no confirmada):</b> {s.baselinePossible.map(i=>i.name).join(', ')}</p>
      :<p className="helper"><b>Sin entrada de esa fecha identificada</b> en la bitácora del Excel. Esto no implica automáticamente una omisión.</p>}
     <div className="reconcile-fields">
      <label>Resultado del cotejo
       <select value={v.status} onChange={e=>modify(s.id,{status:e.target.value},s)}>{STATUSES.map(t=><option key={t}>{t}</option>)}</select>
      </label>
      <label>Integraciones relacionadas (Ctrl para seleccionar varias)
       <select value={v.selected.map(String)} multiple size={4} onChange={e=>modify(s.id,{selected:Array.from(e.target.selectedOptions).map(o=>Number(o.value))},s)}>
        {integrations.map(i=><option key={i.id} value={i.id}>{i.source_numero} · {i.name}</option>)}
       </select>
      </label>
     </div>
     <label className="reconcile-note">Sustento del cotejo
      <textarea rows={2} value={v.notes} onChange={e=>modify(s.id,{notes:e.target.value},s)} placeholder="Indica qué registro de la bitácora cubre esta sesión, o qué falta contrastar."/>
     </label>
     <div className="toolbar"><button className="light" disabled={busy} onClick={()=>saveReconciliation(s)}>Guardar cotejo</button>
      {baselineMatched&&<span className="helper">Integraciones asociadas previamente: {s.integration_ids?.length}</span>}</div>
    </article>
   })}
  </section>
  <section className="panel">
   <div className="sectionhead"><h2>Propuestas recibidas desde ChatGPT</h2><span>{proposals.length} en el periodo</span></div>
   <p className="helper">ChatGPT puede registrar en Neon únicamente los hallazgos nuevos no incluidos en la línea base, con fecha, integración, detalle, acuerdo, pendiente, responsable y fuente. Una propuesta <b>no modifica la bitácora</b> hasta que la apruebes.</p>
   {!proposals.length&&<p className="muted">Sin propuestas pendientes para este periodo. Las observaciones históricas del Excel no se recrearán como propuestas.</p>}
   {proposals.map(p=><article key={p.id} className="finding">
    <div className="findinghead"><b>{p.integration}</b><span>{p.review_status}</span></div>
    <p className="helper">{p.observed_on.slice(0,10)} · {p.source_name} · Origen: {p.source_kind||'ChatGPT'}</p>
    <p><b>Hecho:</b> {p.detail}</p>
    {p.agreement&&<p><b>Acuerdo:</b> {p.agreement}</p>}
    {p.pending&&<p><b>Pendiente:</b> {p.responsible||'Por determinar'}: {p.pending}</p>}
    {p.evidence_quote&&<p><b>Evidencia:</b> {p.evidence_quote}</p>}
    {p.source_url&&<p><a href={p.source_url} target="_blank" rel="noreferrer">Abrir fuente</a></p>}
    {p.review_status==='Propuesto'&&<div className="toolbar">
      <button disabled={busy} onClick={()=>decide(p,'Aprobado')}>Aprobar y agregar a bitácora</button>
      <button disabled={busy} className="light" onClick={()=>decide(p,'Rechazado')}>Rechazar</button>
    </div>}
   </article>)}
  </section>
 </div>
}
