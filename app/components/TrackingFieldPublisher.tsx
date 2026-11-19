'use client';
import {useEffect,useState} from 'react';

type Fields={dependency:string;development_close:string;test_close:string;validation_close:string;considerations:string};
type Integration={
 id:number;source_row?:number;source_batch_id?:string;name:string;
 dependency:string;development_close?:string;test_close?:string;validation_close?:string;considerations?:string;
};
type Draft={id:string;expected:Fields;values:Fields};
type Ready={batchId:string;sourceLabel:string;publishedAt:string|null;approvedCount:number;
 approved:Array<{id:string;integration:string;day:string;detail:string}>};
const fields: Array<{key:keyof Fields;label:string}>=[
 {key:'dependency',label:'Dependencia'},
 {key:'development_close',label:'Cierre de desarrollo'},
 {key:'test_close',label:'Cierre de pruebas SOFTPLAN / GTI'},
 {key:'validation_close',label:'Validación GSJ'},
 {key:'considerations',label:'Consideraciones'}
];
const values=(i:Integration):Fields=>({
 dependency:i.dependency||'',development_close:i.development_close||'',
 test_close:i.test_close||'',validation_close:i.validation_close||'',
 considerations:i.considerations||''
});
const same=(a:Fields,b:Fields)=>fields.every(x=>a[x.key]===b[x.key]);
const errorMessage=(e:unknown)=>e instanceof Error?e.message:String(e);
async function request<T>(url:string,init?:RequestInit):Promise<T>{
 const r=await fetch(url,{cache:'no-store',...init});
 const result=await r.json();
 if(!r.ok)throw Error(result.error||'No fue posible completar la operación');
 return result as T;
}
export default function TrackingFieldPublisher({
 integrations,selectedId,revision,onPublished
}:{
 integrations:Integration[];selectedId:string;revision:string;onPublished:()=>Promise<void>;
}){
 const [editing,setEditing]=useState<Draft|null>(null);
 const [drafts,setDrafts]=useState<Record<string,Draft>>({});
 const [ready,setReady]=useState<Ready|null>(null);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const active=integrations.find(i=>String(i.id)===selectedId);
 const staged=Object.values(drafts);
 useEffect(()=>{request<Ready>('/api/seguimiento').then(setReady).catch(e=>setError(errorMessage(e)));},[revision]);
 function begin(){
  if(!active)return;
  const key=String(active.id),original=values(active);
  setEditing(drafts[key]||{id:key,expected:original,values:{...original}});
  setMessage('');setError('');
 }
 function change(key:keyof Fields,value:string){
  setEditing(prev=>prev?{...prev,values:{...prev.values,[key]:value}}:prev);
 }
 function stage(){
  if(!editing)return;
  const d=editing;setDrafts(prev=>{
   const next={...prev};
   if(same(d.expected,d.values))delete next[d.id];
   else next[d.id]=d;
   return next;
  });
  setEditing(null);setMessage('Modificación preparada. Todavía no se ha publicado en Seguimiento.');
 }
 async function publish(){
  if(editing){setError('Guarda o cancela la edición de campos primero.');return}
  setBusy(true);setError('');setMessage('');
  try{
   const current=await request<Ready>('/api/seguimiento');
   setReady(current);
   if(active?.source_batch_id!==current.batchId)throw Error('Se publicó otro lote Excel. Recarga la página.');
   if(!staged.length&&!current.approvedCount){setMessage('No hay modificaciones pendientes de publicar.');return}
   const preview=staged.length+' integración(es) con campos editados y '+
      current.approvedCount+' propuesta(s) aprobada(s).';
   if(!window.confirm('¿Publicar en Seguimiento?\n\n'+preview+
     '\n\nEl dashboard y la exportación usarán la nueva versión de Neon. Se conservará intacto el Excel original.'))return;
   const result=await request<{published:boolean;rowsChanged:number;proposalsApplied:number;message:string}>('/api/seguimiento',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({batchId:current.batchId,confirm:true,drafts:staged,
     proposalIds:current.approved.map(p=>p.id)})
   });
   if(result.published){
    setDrafts({});
    setEditing(null);
    await onPublished();
   }
   setReady(await request<Ready>('/api/seguimiento'));
   setMessage(result.message+' Integraciones actualizadas: '+result.rowsChanged+
    '. Propuestas incorporadas: '+result.proposalsApplied+'.');
  }catch(e){setError(errorMessage(e))}finally{setBusy(false)}
 }
 return <div className="tracking-publisher">
  <section className="panel tracking-edit-panel">
   <div className="base-header"><div>
    <h2>Editar campos del dashboard</h2>
    <p className="muted">Dependencia, fechas y consideraciones de {active?.name||'la integración seleccionada'}. Prepara varios cambios y publícalos juntos.</p>
   </div>
    <button className="ui-secondary" type="button" disabled={!active||busy} onClick={()=>editing?.id===selectedId?setEditing(null):begin()}>
     {editing?.id===selectedId?'Cancelar edición':'Editar campos'}
    </button>
   </div>
   {active&&editing?.id===selectedId?
    <div className="tracking-fields">
     {fields.map(f=><label className={'journal-field '+(f.key==='considerations'?'tracking-wide':'')} key={f.key}>
      {f.label}
      {f.key==='considerations'?
       <textarea rows={4} value={editing.values[f.key]} maxLength={8000}
        onChange={e=>change(f.key,e.target.value)}/>:
       <input value={editing.values[f.key]} maxLength={200}
        onChange={e=>change(f.key,e.target.value)} placeholder="Valor o fecha según seguimiento"/>}
     </label>)}
     <div className="tracking-wide tracking-edit-actions">
      <button className="ui-primary" type="button" disabled={busy} onClick={stage}>Guardar cambios para publicar</button>
      <button className="ui-secondary" type="button" onClick={()=>setEditing(null)}>Cancelar</button>
     </div>
    </div>:
    <div className="tracking-values">
     {fields.map(f=><div className={f.key==='considerations'?'tracking-wide':''} key={f.key}>
      <b>{f.label}</b>
      <span>{(drafts[selectedId]?.values[f.key]??values(active||{id:0,name:'',dependency:''})[f.key])||'No registrado'}</span>
     </div>)}
    </div>}
   {drafts[selectedId]&&<p className="tracking-pending-note">Cambios preparados para esta integración, pendientes de publicación.</p>}
  </section>
  <section className="panel tracking-publish-panel">
   <div className="base-header"><div>
    <h2>Publicar en Seguimiento</h2>
    <p className="muted">Publica campos editados y propuestas aprobadas en Neon, con trazabilidad, sin modificar el Excel original.</p>
   </div>
    <a className="journal-export" href="https://seguimiento-integraciones-pj.vercel.app/"
       target="_blank" rel="noopener noreferrer">Abrir dashboard</a>
   </div>
   <div className="tracking-stat-row">
    <span><b>{staged.length}</b> integraciones con cambios</span>
    <span><b>{ready?.approvedCount??'…'}</b> propuestas aprobadas por incorporar</span>
   </div>
   {staged.length>0&&<details className="tracking-preview">
    <summary>Revisar campos preparados ({staged.length})</summary>
    {staged.map(d=><div key={d.id}>
     <strong>{integrations.find(i=>String(i.id)===d.id)?.name||d.id}</strong>
     {fields.filter(f=>d.expected[f.key]!==d.values[f.key]).map(f=>
      <p key={f.key}><b>{f.label}:</b> {d.expected[f.key]||'Vacío'} → {d.values[f.key]||'Vacío'}</p>)}
    </div>)}
   </details>}
   {Boolean(ready?.approvedCount)&&<details className="tracking-preview">
    <summary>Revisar propuestas aprobadas ({ready?.approvedCount})</summary>
    {ready?.approved.map(p=><p key={p.id}>{p.day} · {p.integration}: {p.detail}</p>)}
   </details>}
   {error&&<p role="alert" className="warn">{error}</p>}
   {message&&<p role="status" className="success">{message}</p>}
   <button type="button" className="ui-primary tracking-publish-button"
    disabled={busy||Boolean(editing)||!active} onClick={publish}>
    {busy?'Publicando…':'Publicar en Seguimiento'}
   </button>
   <p className="helper">La exportación «Descargar Excel actualizado» se conserva. Puedes generar una copia consolidada cuando quieras, sin introducir manualmente los cambios antes de publicarlos.</p>
  </section>
 </div>;
}
