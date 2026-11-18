'use client';
import {useEffect,useMemo,useState} from 'react';

type Integration={
 id:number;source_numero:string;name:string;status:string;
 dependency:string;criticality:string;situational_log:string;
};
type Entry={observedOn:string;detail:string;agreement:string;pending:string;responsible:string};
type Proposal=Entry&{
 id:number;integration_id:number|string;integration:string;observed_on:string;
 source_name:string;source_url:string;evidence_quote:string;review_status:string;source_kind:string;
};
type Note={id:string;date:string;detail:string;agreement:string;pending:string;raw:string;sortKey:number};
const currentDay=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Lima'});
const clean=(s:string)=>s.replace(/\s+/g,' ').trim();
const summary=(s:string,max=160)=>s.length>max?s.slice(0,max).trimEnd()+'…':s;
const errorText=(e:unknown)=>e instanceof Error?e.message:String(e);
async function api<T>(url:string,init?:RequestInit):Promise<T>{
 const result=await fetch(url,{cache:'no-store',...init});
 const data=await result.json();
 if(!result.ok)throw Error(data.error||'No se pudo completar la solicitud');
 return data as T;
}
function extractParts(value:string){
 const sections=value.split(/\s*\|\s*(?=(?:Acuerdo|Pendiente)\s*:)/i);
 const detail=clean(sections[0]||'');
 const agreement=clean((sections.find(s=>/^Acuerdo\s*:/i.test(s))||'').replace(/^Acuerdo\s*:/i,''));
 const pending=clean((sections.find(s=>/^Pendiente\s*:/i.test(s))||'').replace(/^Pendiente\s*:/i,''));
 return {detail,agreement,pending};
}
function historyNotes(value:string):Note[]{
 const groups:string[]=[];let last='';
 for(const line of value.replace(/\r/g,'').split('\n').map(s=>s.trim()).filter(Boolean)){
  if(/^\d{1,2}\/\d{1,2}(?:\/\d{4})?\s*[-–—]/.test(line)){
   if(last)groups.push(last);
   last=line;
  }else last+=(last?' ':'')+line;
 }
 if(last)groups.push(last);
 return groups.map((raw,index)=>{
  const match=raw.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*[-–—]\s*([\s\S]*)$/);
  const date=match?(match[1].padStart(2,'0')+'/'+match[2].padStart(2,'0')+(match[3]?'/'+match[3]:'')):'Sin fecha';
  const parts=extractParts(match?match[4]:raw);
  const sortKey=match?(Number(match[3]||'2026')*10000+Number(match[2])*100+Number(match[1])):0;
  return {id:String(index),date,raw,...parts,sortKey};
 }).sort((a,b)=>b.sortKey-a.sortKey||Number(b.id)-Number(a.id));
}
function parsePasted(value:string,defaultYear:string):{entries:Entry[];invalid:string[]}{
 const entries:Entry[]=[],invalid:string[]=[];
 const blocks=value.replace(/\r/g,'').split(/\n(?=\s*\d{1,2}\/\d{1,2}(?:\/\d{4})?\s*[-–—])/);
 for(const original of blocks){
  const text=original.trim();if(!text)continue;
  const match=text.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*[-–—]\s*([\s\S]*)$/);
  if(!match){invalid.push(summary(text,65));continue}
  const year=match[3]||defaultYear;
  const observedOn=year+'-'+match[2].padStart(2,'0')+'-'+match[1].padStart(2,'0');
  const parsedDate=new Date(observedOn+'T12:00:00Z');
  if(!Number.isFinite(parsedDate.getTime())||parsedDate.toISOString().slice(0,10)!==observedOn){
   invalid.push('Fecha inválida: '+observedOn);continue;
  }
  const parts=extractParts(clean(match[4]));
  const responsibleMatch=parts.pending.match(/^([^:]{2,110}):\s*(.+)$/);
  const responsible=responsibleMatch?clean(responsibleMatch[1]):'';
  const pending=responsibleMatch?clean(responsibleMatch[2]):parts.pending;
  const entry={observedOn,detail:parts.detail,agreement:parts.agreement,pending,responsible};
  if(entry.detail.length<15||entry.pending&&!entry.responsible){
   invalid.push('Falta hecho o responsable: '+summary(text,65));continue;
  }
  entries.push(entry);
 }
 return {entries,invalid};
}
const asG=(e:Entry)=>{
 const date=e.observedOn.slice(8,10)+'/'+e.observedOn.slice(5,7);
 return date+' - '+e.detail+
  (e.agreement?' | Acuerdo: '+e.agreement:'')+
  (e.pending?' | Pendiente: '+(e.responsible||'Por determinar')+': '+e.pending:'');
};

export default function BitacoraWorkspace({integrations,onRefresh}:{
 integrations:Integration[];onRefresh:()=>Promise<void>;
}){
 const [selected,setSelected]=useState('');
 const [search,setSearch]=useState(''),[onlyPending,setOnlyPending]=useState(false);
 const [mode,setMode]=useState<'simple'|'paste'>('simple');
 const [day,setDay]=useState(currentDay),[detail,setDetail]=useState(''),[agreement,setAgreement]=useState('');
 const [pending,setPending]=useState(''),[responsible,setResponsible]=useState('');
 const [pasted,setPasted]=useState('');
 const [sourceName,setSourceName]=useState(''),[sourceUrl,setSourceUrl]=useState(''),[evidenceQuote,setEvidenceQuote]=useState('');
 const [proposals,setProposals]=useState<Proposal[]>([]);
 const [saving,setSaving]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{if(!selected&&integrations.length)setSelected(String(integrations[0].id));},[selected,integrations]);
 async function refreshProposals(){
  const response=await api<{proposals:Proposal[]}>('/api/proposals');
  setProposals(response.proposals||[]);
 }
 useEffect(()=>{refreshProposals().catch(e=>setError(errorText(e)));},[]);
 const active=integrations.find(i=>String(i.id)===selected);
 const notes=useMemo(()=>historyNotes(active?.situational_log||''),[active?.situational_log]);
 const filtered=useMemo(()=>notes.filter(n=>
  (!onlyPending||Boolean(n.pending))&&
  (!search.trim()||clean(n.raw).toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es')))
 ),[notes,search,onlyPending]);
 const fromPaste=useMemo(()=>parsePasted(pasted,day.slice(0,4)),[pasted,day]);
 const simpleEntry:Entry={observedOn:day,detail:detail.trim(),agreement:agreement.trim(),
  pending:pending.trim(),responsible:responsible.trim()};
 const entries=mode==='paste'?fromPaste.entries:[simpleEntry];
 const pendingProposals=proposals.filter(p=>String(p.integration_id)===String(active?.id)&&p.review_status==='Propuesto');
 async function save(){
  if(!active)return;
  if(mode==='paste'&&(fromPaste.invalid.length||!fromPaste.entries.length)){
   setError('Corrige las líneas no reconocidas antes de guardar. Se necesita DD/MM - Hecho concreto.');return;
  }
  if(entries.length>25){setError('Envía hasta 25 registros por lote.');return;}
  if(entries.some(e=>e.detail.length<15||e.pending&&!e.responsible)){
   setError('El hecho necesita al menos 15 caracteres y cada pendiente debe tener responsable.');return;
  }
  if(!sourceName.trim()){setError('Indica la sesión, acta o correo utilizado.');return;}
  if(!sourceUrl.trim()&&evidenceQuote.trim().length<15){
   setError('Indica una URL de origen o una cita literal de al menos 15 caracteres.');return;
  }
  setSaving(true);setError('');setMessage('');
  try{
   const r=await api<{created:number;duplicates:number;historical:number}>('/api/proposals',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({integrationId:active.id,sourceName,sourceUrl,evidenceQuote,entries})
   });
   setMessage(r.created+' propuesta(s) guardada(s). '+r.duplicates+' duplicada(s) y '+
    r.historical+' ya registrada(s). Ninguna ha modificado la bitácora aprobada.');
   if(r.created){if(mode==='paste')setPasted('');else{setDetail('');setAgreement('');setPending('');setResponsible('')}}
   await refreshProposals();
  }catch(e){setError(errorText(e))}finally{setSaving(false)}
 }
 async function decide(p:Proposal,decision:'Aprobado'|'Rechazado'){
  if(!window.confirm((decision==='Aprobado'?'¿Incorporar este registro a la bitácora Neon?':'¿Descartar este registro?')+
   '\n\n'+asG({observedOn:p.observed_on.slice(0,10),detail:p.detail,agreement:p.agreement,
    pending:p.pending,responsible:p.responsible})))return;
  const reason=decision==='Rechazado'?(window.prompt('Motivo del rechazo:')||''):'';
  setSaving(true);setError('');setMessage('');
  try{
   await api('/api/proposals/'+p.id+'/decision',{method:'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({decision,reason,confirm:true})});
   await Promise.all([refreshProposals(),onRefresh()]);
   setMessage(decision==='Aprobado'?'Registro aprobado e incorporado a Neon.':'Propuesta rechazada, sin alterar el historial.');
  }catch(e){setError(errorText(e))}finally{setSaving(false)}
 }
 async function copyHistory(){
  try{
   await navigator.clipboard.writeText(active?.situational_log||'');
   setMessage('Texto de la columna G copiado.');
  }catch{setError('El navegador no permitió copiar. Utiliza Descargar Excel.')}
 }
 return <div className="journal">
  <section className="panel journal-heading">
   <div className="base-header"><div>
    <h2>Bitácoras por integración</h2>
    <p className="muted">Lee hechos, acuerdos y pendientes sin recorrer un bloque de texto. Los pendientes históricos no acreditan que sigan abiertos.</p>
   </div><a className="journal-export" href="/api/export">Descargar Excel actualizado</a></div>
   <div className="journal-filter-row">
    <label>Integración
     <select value={active?.id||''} onChange={e=>{setSelected(e.target.value);setError('');setMessage('')}}>
      {integrations.map(i=><option key={i.id} value={i.id}>{i.source_numero} · {i.name}</option>)}
     </select>
    </label>
    {active&&<div className="journal-counts">
     <span><b>{notes.length}</b> anotaciones históricas</span>
     <span><b>{notes.filter(n=>n.pending).length}</b> menciones de pendientes</span>
     <span><b>{pendingProposals.length}</b> propuestas por revisar</span>
    </div>}
   </div>
   {active&&<div className="journal-context">
    <strong>{active.status}</strong><span>Dependencia: {active.dependency||'No indicada'}</span>
    <span>Criticidad: {active.criticality||'No informada'}</span>
   </div>}
  </section>
  {error&&<div role="alert" className="warn">{error}</div>}
  {message&&<div role="status" className="success">{message}</div>}
  <div className="journal-grid">
   <section className="panel journal-reader">
    <div className="base-header"><div><h2>Historial</h2><p className="muted">Ordenado por fecha, con detalles plegables.</p></div>
     <button className="ui-secondary" disabled={!active?.situational_log} onClick={copyHistory}>Copiar columna G</button></div>
    <div className="journal-search">
     <input aria-label="Buscar dentro de la bitácora" placeholder="Buscar incidencia, fecha, acuerdo o responsable…"
      value={search} onChange={e=>setSearch(e.target.value)}/>
     <label><input type="checkbox" checked={onlyPending} onChange={e=>setOnlyPending(e.target.checked)}/> Solo menciones de pendientes</label>
    </div>
    <div className="journal-timeline">
     {!filtered.length&&<p className="empty-state">No hay registros para los filtros seleccionados.</p>}
     {filtered.map(n=><details key={n.id} className="journal-note">
      <summary><span className="journal-date">{n.date}</span><span className="journal-teaser">{summary(n.detail)}</span>
       {n.pending&&<span className="journal-pending-tag">Pendiente citado</span>}</summary>
      <div className="journal-note-detail">
       <div><b>Hecho</b><p>{n.detail}</p></div>
       {n.agreement&&<div className="journal-agreement"><b>Acuerdo</b><p>{n.agreement}</p></div>}
       {n.pending&&<div className="journal-pending"><b>Pendiente consignado</b><p>{n.pending}</p></div>}
       <small>Registro histórico. Su vigencia debe contrastarse con las sesiones posteriores.</small>
      </div>
     </details>)}
    </div>
   </section>
   <div className="journal-side">
    <section className="panel journal-editor">
     <h2>Agregar novedades</h2>
     <p className="muted">Registra hechos de una sesión en lenguaje simple. Primero quedan como propuestas; la aprobación es independiente.</p>
     <div className="journal-mode" role="group" aria-label="Modalidad de ingreso">
      <button type="button" className={mode==='simple'?'selected':''} onClick={()=>setMode('simple')}>Una novedad</button>
      <button type="button" className={mode==='paste'?'selected':''} onClick={()=>setMode('paste')}>Pegar varias</button>
     </div>
     <label className="journal-field">Fecha de referencia
      <input type="date" value={day} onChange={e=>setDay(e.target.value)}/>
     </label>
     {mode==='simple'?<>
      <label className="journal-field">¿Qué ocurrió?
       <textarea rows={4} value={detail} onChange={e=>setDetail(e.target.value)}
        placeholder="Ej. Durante la validación, la consulta no devolvió la respuesta esperada."/>
      </label>
      <label className="journal-field">¿Qué se acordó? (opcional)
       <textarea rows={2} value={agreement} onChange={e=>setAgreement(e.target.value)}
        placeholder="Ej. Softplan: Revisar la respuesta y repetir el escenario."/>
      </label>
      <label className="journal-field">¿Qué quedó pendiente? (opcional)
       <textarea rows={2} value={pending} onChange={e=>setPending(e.target.value)}
        placeholder="Ej. Confirmar el resultado de la nueva prueba."/>
      </label>
      {pending.trim()&&<label className="journal-field">Responsable del pendiente
       <input value={responsible} onChange={e=>setResponsible(e.target.value)} placeholder="Softplan / GTI / GSJ"/>
      </label>}
     </>:<>
      <label className="journal-field">Pega las anotaciones de la columna G
       <textarea rows={9} value={pasted} onChange={e=>setPasted(e.target.value)}
        placeholder={'14/11 - Se verificó el escenario de pruebas. | Acuerdo: Softplan: Ajustar la respuesta. | Pendiente: GTI: Confirmar nueva prueba.\n15/11 - Se revisó la corrección; quedó pendiente la validación del usuario.'}/>
      </label>
      <p className="helper">Un registro por fecha. Usa DD/MM - Hecho y, cuando corresponda, «| Acuerdo: Equipo: acción» y «| Pendiente: Equipo: acción». Se usa el año de la fecha de referencia, salvo que indiques DD/MM/AAAA.</p>
      <div className="journal-parse"><b>{fromPaste.entries.length} registro(s) reconocido(s)</b>
       {fromPaste.invalid.length>0&&<span>{fromPaste.invalid.length} línea(s) por corregir: {fromPaste.invalid.map(s=>summary(s,45)).join(' · ')}</span>}
      </div>
     </>}
     <h3>Origen de la información</h3>
     <label className="journal-field">Sesión, acta o correo
      <input value={sourceName} onChange={e=>setSourceName(e.target.value)} placeholder="Ej. Validación SUNARP, 11/11/2026"/>
     </label>
     <label className="journal-field">Enlace a la fuente (recomendado)
      <input type="url" value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)} placeholder="https://…"/>
     </label>
     <label className="journal-field">Cita de sustento (necesaria si no hay enlace)
      <textarea rows={2} value={evidenceQuote} onChange={e=>setEvidenceQuote(e.target.value)}
       placeholder="Fragmento verificable de la transcripción o acta"/>
     </label>
     {entries.length>0&&entries.length<=25&&entries.every(e=>e.detail.length>=15)&&<details className="journal-preview">
      <summary>Vista previa para columna G ({entries.length})</summary>
      {entries.map((e,i)=><p key={i}>{asG(e)}</p>)}
     </details>}
     <button className="ui-primary journal-save" disabled={saving||!active} onClick={save}>
      {saving?'Guardando…':'Guardar como propuesta'}
     </button>
     <p className="helper">No cambia el estado de la integración, no cierra incidencias y no edita el Excel original.</p>
    </section>
    <section className="panel journal-approvals">
     <div className="base-header"><div><h2>Por aprobar</h2><p className="muted">{pendingProposals.length} propuesta(s) de esta integración</p></div>
      <button className="ui-secondary" disabled={saving} onClick={()=>refreshProposals().catch(e=>setError(errorText(e)))}>Actualizar</button></div>
     {!pendingProposals.length&&<p className="empty-state">No hay novedades pendientes de aprobación.</p>}
     {pendingProposals.map(p=><article key={p.id} className="journal-proposal">
      <b>{p.observed_on.slice(0,10)} · {p.source_kind}</b>
      <p>{p.detail}</p>
      {p.agreement&&<p><strong>Acuerdo:</strong> {p.agreement}</p>}
      {p.pending&&<p><strong>Pendiente:</strong> {p.responsible}: {p.pending}</p>}
      <small>Fuente: {p.source_name} {p.source_url&&<a href={p.source_url} target="_blank" rel="noopener noreferrer">Ver fuente</a>}</small>
      {p.evidence_quote&&<p><strong>Sustento:</strong> {summary(p.evidence_quote,320)}</p>}
      <div className="journal-buttons">
       <button className="ui-primary" disabled={saving} onClick={()=>decide(p,'Aprobado')}>Aprobar e incorporar</button>
       <button className="ui-secondary" disabled={saving} onClick={()=>decide(p,'Rechazado')}>Rechazar</button>
      </div>
     </article>)}
    </section>
   </div>
  </div>
 </div>;
}
