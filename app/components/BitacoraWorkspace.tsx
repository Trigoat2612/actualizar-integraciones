'use client';
import {useEffect,useMemo,useState} from 'react';

type Integration={
 id:number;source_numero:string;name:string;status:string;
 dependency:string;criticality:string;situational_log:string;published_at?:string|null;
};
type Entry={observedOn:string;detail:string;agreement:string;pending:string;responsible:string};
type Proposal=Entry&{
 id:number;integration_id:number|string;integration:string;observed_on:string;
 source_name:string;source_url:string;evidence_quote:string;review_status:string;source_kind:string;
 fingerprint:string;approved_at:string|null;edit_count:number;
};
type Note={id:string;date:string;detail:string;agreement:string;pending:string;raw:string;sortKey:number};
type EditDraft=Entry&{
 id:string;integrationId:string;sourceName:string;sourceUrl:string;
 evidenceQuote:string;expectedFingerprint:string;reason:string;
};
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
 const sections=value.split(/\s*\|\s*(?=(?:Acuerdo(?:s|\s+del\s+\d{1,2}\/\d{1,2})?|Pendientes?)\s*:)/i);
 const detail=clean(sections[0]||'');
 const agreementPart=sections.find(s=>/^Acuerdo(?:s|\s+del\s+\d{1,2}\/\d{1,2})?\s*:/i.test(s))||'';
 const pendingPart=sections.find(s=>/^Pendientes?\s*:/i.test(s))||'';
 const agreement=clean(agreementPart.replace(/^Acuerdo(?:s|\s+del\s+\d{1,2}\/\d{1,2})?\s*:/i,''));
 const pending=clean(pendingPart.replace(/^Pendientes?\s*:/i,''));
 return {detail,agreement,pending};
}
const journalHeading=/^(\d{1,2}\/\d{1,2}(?:\/\d{4})?(?:\s*(?:y|al|a|hasta|,|[-–—])\s*\d{1,2}\/\d{1,2}(?:\/\d{4})?)*)\s*[-–—]\s*([\s\S]*)$/i;
function historyNotes(value:string):Note[]{
 const groups:string[]=[];let last='';
 for(const line of value.replace(/\r/g,'').split('\n').map(v=>v.trim()).filter(Boolean)){
  if(journalHeading.test(line)){if(last)groups.push(last);last=line;}
  else last+=(last?'\n':'')+line;
 }
 if(last)groups.push(last);
 return groups.map((raw,index)=>{
  const match=raw.match(journalHeading);
  const label=match?match[1].replace(/\s+/g,' ').trim():'Sin fecha';
  const matches=label.match(/\d{1,2}\/\d{1,2}(?:\/\d{4})?/g)||[];
  const sortKey=matches.reduce((best,part)=>{
   const [d,m,y]=part.split('/').map(Number),year=y||2026;
   const check=new Date(Date.UTC(year,m-1,d));
   return check.getUTCFullYear()===year&&check.getUTCMonth()===m-1&&check.getUTCDate()===d
    ?Math.max(best,year*10000+m*100+d):best;
  },0);
  const parts=extractParts(match?match[2]:raw);
  return {id:String(index),date:sortKey?label:'Sin fecha',raw,...parts,sortKey};
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
 const [editing,setEditing]=useState<EditDraft|null>(null);
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
 // Solo las aprobadas después del lote Excel vigente pueden prepararse para la siguiente publicación.
 const approvedAfterPublication=proposals.filter(p=>String(p.integration_id)===String(active?.id)&&
   p.review_status==='Aprobado'&&Boolean(p.approved_at)&&Boolean(active?.published_at)&&
   new Date(p.approved_at as string).getTime()>new Date(active?.published_at as string).getTime());
 const normalizedLine=(line:string)=>clean(line).toLocaleLowerCase('es');
 const existingLines=new Set((active?.situational_log||'').split(/\r?\n/).map(normalizedLine));
 const linesToPublish=approvedAfterPublication.map(p=>({proposal:p,line:asG({
    observedOn:p.observed_on.slice(0,10),detail:p.detail,agreement:p.agreement,
    pending:p.pending,responsible:p.responsible
  })})).filter(row=>!existingLines.has(normalizedLine(row.line)));
 function startEditing(p:Proposal){
  setError('');setMessage('');
  setEditing({id:String(p.id),integrationId:String(p.integration_id),observedOn:p.observed_on.slice(0,10),
   detail:p.detail,agreement:p.agreement,pending:p.pending,responsible:p.responsible==='Por determinar'?'':p.responsible,
   sourceName:p.source_name,sourceUrl:p.source_url,evidenceQuote:p.evidence_quote,
   expectedFingerprint:p.fingerprint,reason:''});
 }
 function editField<K extends keyof EditDraft>(field:K,value:EditDraft[K]){
  setEditing(previous=>previous?{...previous,[field]:value}:previous);
 }
 async function saveEdit(){
  if(!editing)return;
  if(!editing.integrationId||!editing.observedOn||editing.detail.trim().length<15||
   !editing.sourceName.trim()||(editing.pending.trim()&&!editing.responsible.trim())||
   (!editing.sourceUrl.trim()&&editing.evidenceQuote.trim().length<15)){
   setError('Completa la integración, fecha, hecho, responsable del pendiente y fuente verificable.');return;
  }
  setSaving(true);setError('');setMessage('');
  try{
   const result=await api<{changed:boolean;message:string}>('/api/proposals/'+editing.id,{
    method:'PATCH',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(editing)
   });
   const target=editing.integrationId;
   setEditing(null);
   setSelected(target);
   await refreshProposals();
   setMessage(result.message||'Propuesta editada. Revisa el contenido antes de aprobarla.');
  }catch(e){setError(errorText(e))}finally{setSaving(false)}
 }
 async function prepareG(){
  if(!active||!linesToPublish.length)return;
  const text=[active.situational_log.trimEnd(),...linesToPublish.map(v=>v.line)].filter(Boolean).join('\n');
  try{
   await navigator.clipboard.writeText(text);
   setMessage('Columna G preparada con '+linesToPublish.length+' propuesta(s) aprobada(s). Pega el texto en la celda G del Excel de esta integración y publica una nueva versión para que aparezca en Seguimiento.');
  }catch{setError('No se pudo copiar. Revisa los permisos del portapapeles.')}
 }
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
  if(editing?.id===String(p.id)){setError('Guarda o cancela los cambios antes de aprobar.');return;}
  if(!window.confirm((decision==='Aprobado'?'¿Aprobar la propuesta? No cambiará la columna G hasta que se publique el Excel.':'¿Descartar este registro?')+
   '\n\n'+asG({observedOn:p.observed_on.slice(0,10),detail:p.detail,agreement:p.agreement,
    pending:p.pending,responsible:p.responsible})))return;
  const reason=decision==='Rechazado'?(window.prompt('Motivo del rechazo:')||''):'';
  setSaving(true);setError('');setMessage('');
  try{
   await api('/api/proposals/'+p.id+'/decision',{method:'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({decision,reason,confirm:true})});
   await Promise.all([refreshProposals(),onRefresh()]);
   setMessage(decision==='Aprobado'?'Propuesta aprobada con auditoría. La columna G oficial sigue intacta hasta publicar el Excel.':'Propuesta rechazada, sin alterar el historial.');
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
 </summary>
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
     <p className="helper">No cambia el estado ni la columna G publicada. Los rangos históricos se visualizan completos; para registrar propuestas nuevas utiliza una fecha única.</p>
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
      {Number(p.edit_count)>0&&<small>Ediciones registradas: {p.edit_count}</small>}
      {editing?.id===String(p.id)&&<div className="journal-edit" aria-label={'Editar propuesta '+p.id}>
       <div className="journal-edit-title"><h3>Editar propuesta #{p.id}</h3>
        <span>Los cambios se guardan con auditoría; no modifican el Excel.</span></div>
       <label className="journal-field">Integración
        <select value={editing.integrationId} onChange={e=>editField('integrationId',e.target.value)}>
         {integrations.map(i=><option key={i.id} value={i.id}>{i.source_numero} · {i.name}</option>)}
        </select>
       </label>
       <label className="journal-field">Fecha del hecho
        <input type="date" value={editing.observedOn} onChange={e=>editField('observedOn',e.target.value)}/>
       </label>
       <label className="journal-field">Hecho
        <textarea rows={4} value={editing.detail} onChange={e=>editField('detail',e.target.value)}/>
       </label>
       <label className="journal-field">Acuerdo
        <textarea rows={3} value={editing.agreement} onChange={e=>editField('agreement',e.target.value)}/>
       </label>
       <label className="journal-field">Pendiente
        <textarea rows={3} value={editing.pending} onChange={e=>editField('pending',e.target.value)}/>
       </label>
       {editing.pending.trim()&&<label className="journal-field">Responsable
        <input value={editing.responsible} onChange={e=>editField('responsible',e.target.value)}/>
       </label>}
       <label className="journal-field">Sesión, correo o documento fuente
        <input value={editing.sourceName} onChange={e=>editField('sourceName',e.target.value)}/>
       </label>
       <label className="journal-field">Enlace de evidencia (HTTPS)
        <input type="url" value={editing.sourceUrl} onChange={e=>editField('sourceUrl',e.target.value)}/>
       </label>
       <label className="journal-field">Cita de sustento
        <textarea rows={3} value={editing.evidenceQuote} onChange={e=>editField('evidenceQuote',e.target.value)}/>
       </label>
       <label className="journal-field">Motivo del ajuste (opcional)
        <input value={editing.reason} onChange={e=>editField('reason',e.target.value)} placeholder="Ej. Precisar el acuerdo de la sesión"/>
       </label>
       <div className="journal-preview"><strong>Vista previa de la anotación</strong>
        <p>{asG(editing)}</p></div>
       <div className="journal-buttons">
        <button type="button" className="ui-primary" disabled={saving} onClick={saveEdit}>Guardar cambios</button>
        <button type="button" className="ui-secondary" disabled={saving} onClick={()=>setEditing(null)}>Cancelar</button>
       </div>
      </div>}
      <div className="journal-buttons">
       <button className="ui-secondary" disabled={saving||Boolean(editing&&editing.id!==String(p.id))} onClick={()=>editing?.id===String(p.id)?setEditing(null):startEditing(p)}>
        {editing?.id===String(p.id)?'Cerrar edición':'Editar'}
       </button>
       <button className="ui-primary" disabled={saving||editing?.id===String(p.id)} onClick={()=>decide(p,'Aprobado')}>Aprobar</button>
       <button className="ui-secondary" disabled={saving||editing?.id===String(p.id)} onClick={()=>decide(p,'Rechazado')}>Rechazar</button>
      </div>
     </article>)}
    </section>
    <section className="panel journal-ready">
     <h2>Preparar actualización para el dashboard</h2>
     <p className="muted">Después de editar y aprobar, aquí aparecerán las propuestas aprobadas después de la última publicación del Excel que aún no están en la columna G.</p>
     {!linesToPublish.length?<p className="empty-state">No hay propuestas nuevas aprobadas para preparar.</p>:<>
      <div className="journal-ready-list">{linesToPublish.map(row=><details key={String(row.proposal.id)}>
       <summary>{row.proposal.observed_on.slice(0,10)} · {summary(row.proposal.detail,110)}</summary>
       <p>{row.line}</p>
      </details>)}</div>
      <button className="ui-primary journal-save" type="button" onClick={prepareG}>Copiar columna G con {linesToPublish.length} aprobada(s)</button>
     </>}
     <p className="helper"><strong>Publicación:</strong> Pega la columna G preparada en el Excel original de esta integración y publica la nueva versión. Solo entonces se actualizará el dashboard de Seguimiento. Las propuestas nunca se agregan al historial por aprobarlas.</p>
    </section>
   </div>
  </div>
 </div>;
}
