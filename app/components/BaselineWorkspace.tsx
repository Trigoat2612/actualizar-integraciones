'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';

type Integration={id:number;name:string;source_numero:string};
type Difference={integration:string;number:string;column:string;oldLength:number;newLength:number;oldExcerpt:string;newExcerpt:string};
type Preview={preview:true;rows:number;hash:string;differences:Difference[];canApply:boolean;warning:string};
type Version={id:number;source_filename:string;file_sha256:string;row_count:number;imported_at:string;active:boolean};
type BaselineResponse={versions:Version[];baselineRows:number;coverage:Array<{status:string;total:number}>};
type DocumentRef={id:number;title:string;url:string;mime:string};
type ReconcileSession={id:number;title:string;start_at:string;event_url:string;event_status:string;source_count:number;video_count:number;coverage_status:string;notes?:string;checked_by?:string;integration_ids?:number[];requiresRecheck:boolean;documents:DocumentRef[]};
type Counts={total:number;'Por cotejar':number;'Cubierta en base':number;'Omisión detectada':number;'Fuera de alcance':number};
type ReconcileResponse={baselineReady:boolean;sessions:ReconcileSession[];counts:Counts;total:number;page:number;pageSize:number;warning?:string;message?:string};
type Proposal={id:number;integration_id:number;integration:string;event_id:number|null;observed_on:string;source_name:string;source_url:string;source_kind:string;detail:string;agreement:string;pending:string;responsible:string;evidence_quote:string;proposed_status:string;review_status:string};
type Decision='Por cotejar'|'Cubierta en base'|'Omisión detectada'|'Fuera de alcance';
type Editor={status:Decision;notes:string;selected:number[]};
const DECISIONS:{status:Decision;label:string;description:string}[]=[
 {status:'Cubierta en base',label:'Ya documentada',description:'La bitácora contiene los hechos relevantes de esta sesión.'},
 {status:'Omisión detectada',label:'Falta información',description:'Hay hechos, acuerdos o pendientes que deben incorporarse.'},
 {status:'Fuera de alcance',label:'No corresponde',description:'La reunión no corresponde a las integraciones de este inventario.'}
];
const fmt=(s:string)=>new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',dateStyle:'medium',timeStyle:'short'}).format(new Date(s));
const err=(e:unknown)=>e instanceof Error?e.message:String(e);
async function api<T>(url:string,init?:RequestInit):Promise<T>{
 const r=await fetch(url,{cache:'no-store',...init}),data=await r.json();
 if(!r.ok)throw Error(data.error||'Error al consultar');
 return data as T;
}
export default function BaselineWorkspace({from,to,integrations,onRefresh}:{from:string;to:string;integrations:Integration[];onRefresh:()=>Promise<void>}){
 const [baseline,setBaseline]=useState<BaselineResponse|null>(null);
 const [coverage,setCoverage]=useState<ReconcileResponse|null>(null);
 const [proposals,setProposals]=useState<Proposal[]>([]);
 const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState<Preview|null>(null);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const [showImport,setShowImport]=useState(false);
 const [filter,setFilter]=useState('Por cotejar'),[search,setSearch]=useState(''),[query,setQuery]=useState('');
 const [page,setPage]=useState(1),[expanded,setExpanded]=useState<number|null>(null),[integrationQuery,setIntegrationQuery]=useState('');
 const [edit,setEdit]=useState<Record<number,Editor>>({});
 const loadStatic=useCallback(async()=>{
  const [a,c]=await Promise.all([
   api<BaselineResponse>('/api/baseline'),
   api<{proposals:Proposal[]}>('/api/proposals?from='+encodeURIComponent(from)+'&to='+encodeURIComponent(to))
  ]);
  setBaseline(a);setProposals(c.proposals);
 },[from,to]);
 const loadCoverage=useCallback(async()=>{
  const url='/api/reconciliation?from='+encodeURIComponent(from)+'&to='+encodeURIComponent(to)+
   '&page='+page+'&pageSize=8&status='+encodeURIComponent(filter==='Todos'?'Todos':filter)+'&q='+encodeURIComponent(query);
  const c=await api<ReconcileResponse>(url);
  setCoverage(c);
 },[from,to,filter,query,page]);
 const reload=useCallback(async()=>{await Promise.all([loadStatic(),loadCoverage()]);},[loadStatic,loadCoverage]);
 useEffect(()=>{reload().catch(e=>setError(err(e)));},[reload]);
 useEffect(()=>{setPage(1);setExpanded(null);},[from,to]);
 const active=baseline?.versions.find(v=>v.active);
 const list=useMemo(()=>integrations.filter(i=>(i.source_numero+' '+i.name).toLocaleLowerCase('es').includes(integrationQuery.toLocaleLowerCase('es'))),[integrations,integrationQuery]);
 function editor(s:ReconcileSession):Editor{
  return edit[s.id]||{status:s.coverage_status as Decision||'Por cotejar',notes:s.notes||'',selected:(s.integration_ids||[]).map(Number)};
 }
 function setField(s:ReconcileSession,patch:Partial<Editor>){
  setEdit(prev=>({...prev,[s.id]:{...(prev[s.id]||{status:s.coverage_status as Decision||'Por cotejar',notes:s.notes||'',selected:(s.integration_ids||[]).map(Number)}),...patch}}));
 }
 function open(s:ReconcileSession){
  if(expanded===s.id){setExpanded(null);return}
  setExpanded(s.id);setIntegrationQuery('');
 }
 async function upload(confirm:boolean){
  if(!file){setError('Selecciona el archivo original.');return}
  if(confirm&&(!preview||!window.confirm('¿Confirmar actualización de la línea base? Se creará un respaldo.')))return;
  setBusy(true);setError('');setMessage('');
  try{
   const form=new FormData();form.set('file',file);
   if(confirm&&preview){form.set('confirm','true');form.set('hash',preview.hash)}
   const result=await api<Preview|{imported:boolean;rows:number}>('/api/baseline',{method:'POST',body:form});
   if('preview' in result){setPreview(result);setMessage('Comparación lista. No se ha realizado ningún cambio.')}
   else{setPreview(null);setFile(null);setShowImport(false);setMessage('Línea base actualizada y respaldada.');await reload();await onRefresh()}
  }catch(e){setError(err(e))}finally{setBusy(false)}
 }
 async function save(s:ReconcileSession){
  const v=editor(s);
  if(v.status==='Por cotejar'){setError('Selecciona un resultado antes de guardar.');return}
  if(v.notes.trim().length<15){setError('Escribe un sustento de al menos 15 caracteres.');return}
  if(v.status!=='Fuera de alcance'&&v.selected.length===0){setError('Selecciona la integración realmente tratada en esta sesión.');return}
  setBusy(true);setError('');setMessage('');
  try{
   await api('/api/reconciliation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventId:s.id,status:v.status,notes:v.notes,integrationIds:v.selected})});
   setMessage('Cotejo registrado para «'+s.title+'».');
   setExpanded(null);setEdit(prev=>{const next={...prev};delete next[s.id];return next});
   await loadCoverage();
  }catch(e){setError(err(e))}finally{setBusy(false)}
 }
 async function decide(p:Proposal,decision:'Aprobado'|'Rechazado'){
  if(!window.confirm((decision==='Aprobado'?'¿Incorporar esta propuesta a la bitácora?':'¿Rechazar esta propuesta?')+' '+p.integration))return;
  const reason=decision==='Rechazado'?(window.prompt('Justificación del rechazo:')||''):'';
  setBusy(true);setError('');setMessage('');
  try{
   await api('/api/proposals/'+p.id+'/decision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({decision,reason,confirm:true})});
   setMessage('Decisión registrada: '+decision+'.');await reload();await onRefresh();
  }catch(e){setError(err(e))}finally{setBusy(false)}
 }
 const counts=coverage?.counts||{'total':0,'Por cotejar':0,'Cubierta en base':0,'Omisión detectada':0,'Fuera de alcance':0};
 const totalPages=Math.max(1,Math.ceil((coverage?.total||0)/8));
 return <div className="workspace">
  <section className="panel base-card">
   <div className="base-header">
    <div><h2>Línea base de seguimiento</h2>
     <p className="muted">El Excel se importa una vez. Las futuras actualizaciones se conservan en Neon.</p></div>
    <button className="light ui-secondary" disabled={busy} onClick={()=>reload().catch(e=>setError(err(e)))}>Actualizar vista</button>
   </div>
   {active?<div className="base-active">
    <span className="base-ok">✓</span>
    <div><strong>Base configurada: {baseline?.baselineRows} integraciones</strong><span>{active.source_filename} · versión {active.id} · {fmt(active.imported_at)}</span></div>
   </div>:<div className="notice">Primera configuración pendiente: importa el Excel oficial una sola vez para activar el cotejo.</div>}
   <div className="base-actions">
    <a href="/api/export" className="export">Descargar seguimiento actualizado</a>
    <button className="text-link" onClick={()=>{setShowImport(!showImport);setPreview(null)}} aria-expanded={showImport}>
     {showImport?'Ocultar administración del Excel':active?'Administrar o reemplazar línea base':'Importar Excel oficial'}
    </button>
   </div>
   {showImport&&<div className="admin-panel">
    <h3>{active?'Reemplazar línea base':'Importar por primera vez'}</h3>
    <p className="helper">Esta operación es excepcional. No se necesita para buscar sesiones, cotejar reuniones ni actualizar bitácoras.</p>
    <div className="toolbar">
     <label className="uploadlabel">Archivo original (.xlsx)<input type="file" accept=".xlsx" onChange={e=>{setFile(e.target.files?.[0]||null);setPreview(null)}}/></label>
     <button className="light ui-secondary" disabled={!file||busy} onClick={()=>upload(false)}>Ver diferencias</button>
    </div>
    {preview&&<div className="baseline-preview">
     <h3>Comparación antes de guardar</h3>
     <p>{preview.rows} integraciones, {preview.differences.length} campos distintos. Todavía no hay cambios en Neon.</p>
     <div className="diff-scroll">{preview.differences.map((d,i)=><details key={i}><summary>{d.integration} · {d.column}</summary>
      <p><b>Actual:</b> {d.oldExcerpt||'Vacío'}</p><p><b>Excel:</b> {d.newExcerpt||'Vacío'}</p></details>)}</div>
     <button className="ui-primary" disabled={busy} onClick={()=>upload(true)}>Confirmar actualización con respaldo</button>
    </div>}
   </div>}
  </section>
  {error&&<div className="warn" role="alert">{error}</div>}
  {message&&<div className="success" role="status">{message}</div>}
  <section className="panel coverage-panel">
   <div className="base-header">
    <div><h2>Cobertura de sesiones</h2><p className="muted">Periodo: {from} al {to} · Identifica lo que ya figura en el Excel y lo que falta documentar.</p></div>
   </div>
   <div className="coverage-summary" aria-label="Resumen de sesiones">
    <button className={filter==='Todos'?'chosen':''} onClick={()=>{setFilter('Todos');setPage(1)}}><strong>{counts.total}</strong><span>Todas</span></button>
    <button className={filter==='Por cotejar'?'chosen':''} onClick={()=>{setFilter('Por cotejar');setPage(1)}}><strong>{counts['Por cotejar']}</strong><span>Por revisar</span></button>
    <button className={filter==='Cubierta en base'?'chosen':''} onClick={()=>{setFilter('Cubierta en base');setPage(1)}}><strong>{counts['Cubierta en base']}</strong><span>Documentadas</span></button>
    <button className={filter==='Omisión detectada'?'chosen':''} onClick={()=>{setFilter('Omisión detectada');setPage(1)}}><strong>{counts['Omisión detectada']}</strong><span>Con faltantes</span></button>
    <button className={filter==='Fuera de alcance'?'chosen':''} onClick={()=>{setFilter('Fuera de alcance');setPage(1)}}><strong>{counts['Fuera de alcance']}</strong><span>No aplican</span></button>
   </div>
   <form className="coverage-search" onSubmit={e=>{e.preventDefault();setPage(1);setQuery(search)}}>
    <label htmlFor="session-search">Buscar por nombre de sesión</label>
    <div><input id="session-search" value={search} placeholder="Ej.: Conflicto de Autoridad, SUNARP..." onChange={e=>setSearch(e.target.value)}/>
     <button className="ui-primary" type="submit">Buscar</button>
     {query&&<button className="ui-secondary" type="button" onClick={()=>{setSearch('');setQuery('');setPage(1)}}>Limpiar</button>}
    </div>
   </form>
   <div className="coverage-guide">
    <strong>¿Qué debo hacer?</strong> Abre una reunión, consulta sus notas de Gemini, confirma qué integraciones se trataron y decide si la información ya está en la bitácora o si falta incorporarla. No necesitas analizar nuevamente una sesión que ya está documentada.
   </div>
   {!active&&<p className="notice">Necesitas importar la línea base para habilitar la conciliación.</p>}
   {active&&coverage?.sessions.length===0&&<div className="empty-state">No hay sesiones para estos filtros. Puedes cambiar el periodo o utilizar «Buscar sesiones y registrar avance» para consultar Calendar.</div>}
   <div className="session-stack">
    {active&&coverage?.sessions.map(s=>{
     const editing=expanded===s.id,v=editor(s);
     return <article className={'coverage-session'+(editing?' opened':'')} key={s.id}>
      <button className="coverage-session-head" onClick={()=>open(s)} aria-expanded={editing}>
       <span className="coverage-session-main"><strong>{s.title}</strong><small>{fmt(s.start_at)} · {s.source_count} adjuntos ({s.video_count} grabaciones)</small></span>
       <span className="coverage-session-side"><span className={'state-tag '+(s.coverage_status==='Por cotejar'?'state-pending':'')}>{s.requiresRecheck?'Revisar nueva base':s.coverage_status==='Por cotejar'?'Por revisar':s.coverage_status}</span><span className="chevron">{editing?'−':'+'}</span></span>
      </button>
      {editing&&<div className="coverage-detail">
       <div className="coverage-step"><span className="step-no">1</span><div className="coverage-step-content">
        <h3>Consulta la evidencia de la reunión</h3>
        <p>Revisa las notas y compáralas con la bitácora de las integraciones implicadas. Tener documentos adjuntos no significa que hayan sido analizados.</p>
        <div className="doc-links">
         <a href={s.event_url} target="_blank" rel="noreferrer">Abrir evento de Calendar</a>
         {s.documents?.map(d=><a key={d.id} href={d.url} target="_blank" rel="noreferrer">{d.title||'Abrir notas'}</a>)}
        </div>
       </div></div>
       <div className="coverage-step"><span className="step-no">2</span><div className="coverage-step-content">
        <h3>¿Cuál es el resultado del cotejo?</h3>
        <div className="decision-grid" role="group" aria-label="Resultado del cotejo">
         {DECISIONS.map(d=><button type="button" key={d.status} className={'decision-card'+(v.status===d.status?' selected':'')} onClick={()=>setField(s,{status:d.status,selected:d.status==='Fuera de alcance'?[]:v.selected})}>
          <span>{v.status===d.status?'◉':'○'} {d.label}</span><small>{d.description}</small>
         </button>)}
        </div>
       </div></div>
       {v.status!=='Fuera de alcance'&&<div className="coverage-step"><span className="step-no">3</span><div className="coverage-step-content">
        <h3>¿Qué integraciones fueron tratadas?</h3>
        <p>Marca una o varias integraciones verificadas en las notas. Puedes buscar por nombre o número.</p>
        {!!v.selected.length&&<div className="selection-tags">{v.selected.map(id=>{
         const i=integrations.find(j=>j.id===id);
         return i?<button key={id} type="button" onClick={()=>setField(s,{selected:v.selected.filter(n=>n!==id)})}>{i.name} ×</button>:null;
        })}</div>}
        <input className="integration-search" value={integrationQuery} onChange={e=>setIntegrationQuery(e.target.value)} placeholder="Buscar integración, ej. SERNOT" aria-label="Buscar integración"/>
        <div className="integration-options" role="group" aria-label="Integraciones relacionadas">
         {list.map(i=><label key={i.id}><input type="checkbox" checked={v.selected.includes(i.id)} onChange={e=>setField(s,{selected:e.target.checked?[...v.selected,i.id]:v.selected.filter(id=>id!==i.id)})}/><span>{i.source_numero} · {i.name}</span></label>)}
         {!list.length&&<p className="muted">No hay integraciones coincidentes.</p>}
        </div>
       </div></div>}
       <div className="coverage-step"><span className="step-no">{v.status==='Fuera de alcance'?'3':'4'}</span><div className="coverage-step-content">
        <h3>Deja constancia del resultado</h3>
        <label className="reconcile-note">Sustento del cotejo
         <textarea rows={3} value={v.notes} onChange={e=>setField(s,{notes:e.target.value})}
          placeholder={v.status==='Cubierta en base'?'Ej.: La sesión está cubierta por el registro del 04/11 de SERNOT, que documenta las incidencias y acuerdos tratados.':v.status==='Omisión detectada'?'Ej.: Falta incorporar la incidencia del servicio, el acuerdo y el responsable consignados en las notas.':'Indica el registro, evidencia o motivo por el que corresponde esta clasificación.'}/>
        </label>
        <div className="toolbar">
         <button className="ui-primary" disabled={busy||v.status==='Por cotejar'||v.notes.trim().length<15||(v.status!=='Fuera de alcance'&&v.selected.length===0)} onClick={()=>save(s)}>Guardar resultado</button>
         <button className="ui-secondary" onClick={()=>setExpanded(null)}>Cerrar sin guardar</button>
        </div>
        <p className="helper">Este paso solo registra la cobertura de la reunión. No cambia el estado oficial de ninguna integración ni agrega hechos automáticamente.</p>
       </div></div>
      </div>}
     </article>;
    })}
   </div>
   {active&&totalPages>1&&<div className="pagination">
    <button className="ui-secondary" onClick={()=>{setPage(n=>Math.max(1,n-1));setExpanded(null)}} disabled={page<=1}>Anterior</button>
    <span>Página {page} de {totalPages} · {coverage?.total||0} resultados</span>
    <button className="ui-secondary" onClick={()=>{setPage(n=>Math.min(totalPages,n+1));setExpanded(null)}} disabled={page>=totalPages}>Siguiente</button>
   </div>}
  </section>
  <section className="panel proposal-panel">
   <div className="base-header"><div><h2>Actualizaciones propuestas por ChatGPT</h2><p className="muted">Los registros nuevos se incorporan a la bitácora únicamente cuando los apruebas.</p></div><span className="proposal-count">{proposals.filter(p=>p.review_status==='Propuesto').length} por decidir</span></div>
   {!proposals.length&&<div className="empty-state">No hay propuestas nuevas para este periodo. Las observaciones históricas ya están conservadas en el Excel maestro de Neon.</div>}
   {proposals.map(p=><article key={p.id} className="finding">
    <div className="findinghead"><b>{p.integration}</b><span className="state-tag">{p.review_status}</span></div>
    <p className="helper">{p.observed_on.slice(0,10)} · {p.source_name} · {p.source_kind||'ChatGPT'}</p>
    <p><b>Hecho:</b> {p.detail}</p>
    {p.agreement&&<p><b>Acuerdo:</b> {p.agreement}</p>}
    {p.pending&&<p><b>Pendiente:</b> {p.responsible||'Por determinar'}: {p.pending}</p>}
    {p.evidence_quote&&<p><b>Evidencia:</b> {p.evidence_quote}</p>}
    {p.source_url&&<p><a href={p.source_url} target="_blank" rel="noreferrer">Ver fuente</a></p>}
    {p.review_status==='Propuesto'&&<div className="toolbar">
     <button className="ui-primary" disabled={busy} onClick={()=>decide(p,'Aprobado')}>Aprobar e incorporar</button>
     <button className="ui-secondary" disabled={busy} onClick={()=>decide(p,'Rechazado')}>Rechazar</button>
    </div>}
   </article>)}
  </section>
 </div>;
}
