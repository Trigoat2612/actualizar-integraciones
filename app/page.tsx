'use client';
import {useEffect,useState} from 'react';
import {signIn,signOut,useSession,SessionProvider} from 'next-auth/react';

type Session={id:number;title:string;start_at:string;event_url:string;source_count:number;read_count:number;video_count:number;findings_count:number;integrations:string|null};
type Integration={id:number;source_numero:string;name:string;status:string;dependency:string;criticality:string;situational_log:string};
type Source={id:number;title:string;source_url:string;mime_type:string;read_status:string;processed_chunks:number;total_chunks:number;error_detail:string};
type Finding={id:number;integration:string;happened_on:string;detail:string;agreement:string;pending:string;owner_team:string;proposed_status:string;evidence_excerpt:string;review_status:string;source_url:string};
type Detail={event:Session;sources:Source[];findings:Finding[]};
type Health={ready:boolean;missing:string[];analysisReady:boolean;analysisConfigured:boolean};
const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/Lima'});
const asDay=(s:string)=>s?.slice(0,10)||'';
const lima=(s:string)=>new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',dateStyle:'medium',timeStyle:'short'}).format(new Date(s));
async function request(url:string,init?:RequestInit){
 const r=await fetch(url,{...init,cache:'no-store'}),json=await r.json();
 if(!r.ok)throw Error(json.error||'Error de solicitud');return json;
}
function Portal(){
 const {data:session,status}=useSession();
 const [tab,setTab]=useState<'sessions'|'integrations'|'pending'>('sessions');
 const [health,setHealth]=useState<Health|null>(null);
 const [from,setFrom]=useState('2026-11-04'),[to,setTo]=useState(today),[single,setSingle]=useState(false);
 const [day,setDay]=useState('2026-11-04'),[scope,setScope]=useState('Todas'),[force,setForce]=useState(false);
 const [sessions,setSessions]=useState<Session[]>([]),[integrations,setIntegrations]=useState<Integration[]>([]),[pending,setPending]=useState<Array<{id:number;integration:string;session:string;pending:string;owner_team:string;source_url:string;happened_on:string}>>([]);
 const [detail,setDetail]=useState<Detail|null>(null),[selected,setSelected]=useState<number|null>(null);
 const [loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const [batchId,setBatchId]=useState<number|null>(null),[showHistory,setShowHistory]=useState<number|null>(null);
 const [syntheticResult,setSyntheticResult]=useState<{model:string;validFindings:number;checks:{expectedIntegration:boolean;evidenceGrounded:boolean};findings:Array<{integration:string;happened:string;pending:string;responsible:string;evidence:string}>}|null>(null);
 const rangeFrom=single?day:from,rangeTo=single?day:to;
 useEffect(()=>{request('/api/health').then(setHealth).catch(()=>{});},[]);
 useEffect(()=>{if(session)refresh();},[session]);
 async function refresh(){
  try{
   const [a,b,c]=await Promise.all([
    request('/api/sessions?from='+encodeURIComponent(rangeFrom)+'&to='+encodeURIComponent(rangeTo)),
    request('/api/integrations'),request('/api/pending')
   ]);
   setSessions(a.sessions||[]);setIntegrations(b.integrations||[]);setPending(c.pending||[]);
  }catch(e){setError(String(e instanceof Error?e.message:e));}
 }
 async function syntheticTest(){
  setBusy(true);setError('');setMessage('');setSyntheticResult(null);
  try{
   const result=await request('/api/analysis/test',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
   setSyntheticResult(result);
   setMessage('Prueba ficticia ejecutada. No se ha enviado una transcripción real ni se ha escrito en Neon.');
  }catch(e){setError(String(e instanceof Error?e.message:e))}
  finally{setBusy(false)}
 }
 async function discover(){
  if(!rangeFrom||!rangeTo||rangeFrom>rangeTo){setError('Selecciona un periodo válido');return;}
  setLoading(true);setError('');setMessage('');
  try{
   const r=await request('/api/calendar/discover',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({from:rangeFrom,to:rangeTo,integration:scope,mode:force?'forzar':'incremental'})});
   setBatchId(r.batchId);
   setMessage('Sesiones encontradas: '+r.found+'. Referencias de adjuntos: '+r.attachmentReferences+'. Se registró el inventario en Neon sin analizar todavía los videos.');
   await refresh();
  }catch(e){setError(String(e instanceof Error?e.message:e));}
  finally{setLoading(false)}
 }
 async function openSession(id:number){
  setSelected(id);setDetail(null);setError('');
  try{setDetail(await request('/api/sessions/'+id));}catch(e){setError(String(e instanceof Error?e.message:e));}
 }
 async function processSelected(reprocess=false){
  if(selected===null)return;
  setBusy(true);setError('');setMessage('');
  try{
   const results:string[]=[];let processed=0;
   for(let step=0;step<8;step++){
    const r=await request('/api/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventId:selected,integration:scope,force:reprocess&&step===0,batchId})});
    if(r.error){results.push('Fuente no accesible: '+r.error);break;}
    if(r.message){results.push(r.message);break;}
    processed++;results.push('Fragmento '+r.processed+'/'+r.total+'; '+r.added+' hallazgos nuevos.');
    if(r.complete)break;
    if(!r.notesRemaining&&r.processed>=r.total)break;
   }
   setMessage(results.join(' ')+' Se conserva el avance; ejecuta de nuevo si hay documentos pendientes.');
   await openSession(selected);await refresh();
  }catch(e){setError(String(e instanceof Error?e.message:e))}
  finally{setBusy(false)}
 }
 async function decide(f:Finding,decision:'Aprobado'|'Rechazado'){
  const ok=window.confirm((decision==='Aprobado'?'¿Aprobar e incorporar a la bitácora de Neon?':'¿Rechazar este hallazgo?')+' '+f.integration);
  if(!ok)return;
  const reason=decision==='Rechazado'?(window.prompt('Motivo de rechazo (opcional):')||''):'';
  setBusy(true);setError('');
  try{
   await request('/api/findings/'+f.id+'/decision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({decision,confirm:true,reason})});
   setMessage('Decisión guardada con auditoría: '+decision+'.');
   if(selected!==null)await openSession(selected);
   await refresh();
  }catch(e){setError(String(e instanceof Error?e.message:e))}
  finally{setBusy(false)}
 }
 const sessionCount=sessions.length,scanned=sessions.filter(s=>Number(s.read_count)>0).length,
       sourceCount=sessions.reduce((n,s)=>n+Number(s.source_count),0),videos=sessions.reduce((n,s)=>n+Number(s.video_count),0);
 const relevantPending=pending.filter(f=>scope==='Todas'||f.integration===scope);
 return <main className="shell">
  <header className="top"><div className="brand">EJE <span>NO PENAL</span><small>Seguimiento de integraciones · Laboral</small></div>
   <div className="topright"><span className="tag">Bajo demanda</span>{session&&<button className="ghost" onClick={()=>signOut()}>Cerrar sesión</button>}</div>
  </header>
  <section className="hero"><div className="eyebrow">GESTIÓN TÉCNICA Y FUNCIONAL</div><h1>Actualizador de integraciones</h1>
   <p>Revisa sesiones de Calendar, contrasta transcripciones y conserva cada avance en Neon, sin perder la bitácora histórica.</p></section>
  {!session?<section className="panel login">
   <h2>Acceso privado</h2><p>El portal solo permite ingresar con la cuenta autorizada de Google Calendar. Los resultados se almacenan en Neon.</p>
   {health&&!health.ready&&<div className="warn">Configuración pendiente: {health.missing.join(', ')}.</div>}
   <button onClick={()=>signIn('google')} disabled={status==='loading'||health?.ready===false}>Ingresar con Google</button>
  </section>:<>
   <section className="metrics">
    <div><span>Integraciones</span><strong>{integrations.length}</strong><small>Inventario Neon</small></div>
    <div><span>Sesiones en rango</span><strong>{sessionCount}</strong><small>{scanned} con notas leídas</small></div>
    <div><span>Fuentes identificadas</span><strong>{sourceCount}</strong><small>{videos} videos sin revisión automática</small></div>
    <div><span>IA</span><strong className="short">{health?.analysisReady?'Configurada':'Pendiente'}</strong><small>Debe estar autorizada</small></div>
   </section>
   <section className="panel">
    <div className="sectionhead"><h2>Ejecutar revisión manual</h2><span>Calendar: {session.user?.email}</span></div>
    <div className="fields">
     <label><span>Modalidad</span><select value={single?'one':'range'} onChange={e=>setSingle(e.target.value==='one')}><option value="range">Rango de fechas</option><option value="one">Fecha específica</option></select></label>
     {single?<label><span>Fecha</span><input type="date" value={day} onChange={e=>setDay(e.target.value)}/></label>:<>
      <label><span>Desde</span><input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
      <label><span>Hasta</span><input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></>}
     <label><span>Integración a analizar</span><select value={scope} onChange={e=>setScope(e.target.value)}>
      <option value="Todas">Todas las integraciones</option>
      {integrations.map(i=><option key={i.id} value={i.name}>{i.name}</option>)}
     </select></label>
    </div>
    <div className="toolbar">
     <button onClick={discover} disabled={loading}>{loading?'Consultando Calendar...':'Buscar sesiones y registrar avance'}</button>
     <button className="light" onClick={refresh} disabled={loading}>Consultar guardadas</button>
     <label className="check"><input type="checkbox" checked={force} onChange={e=>setForce(e.target.checked)}/>Revisión forzada</label>
     <a href="/api/export" className="export">Exportar a Excel</a>
    </div>
    <p className="helper">Buscar sesiones registra los eventos y documentos, pero no presupone que fueron analizados. El procesamiento de transcripciones se inicia por sesión.</p>
    <div className="notice"><b>Comprobar OpenAI sin enviar información judicial:</b> la prueba utiliza exclusivamente un acta ficticia incorporada al código, no guarda hallazgos ni cambia estados de las integraciones.</div>
    <div className="toolbar"><button className="light" onClick={syntheticTest} disabled={busy||!health?.analysisConfigured}>{busy?'Probando OpenAI...':'Ejecutar prueba sintética de OpenAI'}</button>
      {!health?.analysisConfigured&&<span className="muted">Configura ANALYSIS_API_URL, ANALYSIS_API_KEY y ANALYSIS_MODEL en Vercel.</span>}
    </div>
    {syntheticResult&&<div className="notice"><b>Prueba OpenAI: {syntheticResult.validFindings} hallazgos ficticios con evidencia comprobable · {syntheticResult.model}</b>
       {syntheticResult.findings.map((f,i)=><p key={i}><b>{f.integration}:</b> {f.happened} <b>Pendiente:</b> {f.pending} <b>Responsable:</b> {f.responsible}</p>)}
       <p>Esta comprobación no autoriza el envío de transcripciones de Calendar.</p>
    </div>}
   </section>
   {error&&<div className="warn">{error}</div>}
   {message&&<div className="success">{message}</div>}
   <nav className="tabs">
    <button className={tab==='sessions'?'active':''} onClick={()=>setTab('sessions')}>Sesiones</button>
    <button className={tab==='integrations'?'active':''} onClick={()=>setTab('integrations')}>Por integración</button>
    <button className={tab==='pending'?'active':''} onClick={()=>setTab('pending')}>Pendientes revisados</button>
   </nav>
   {tab==='sessions'&&<div className="twocol">
    <section className="panel sessionlist">
     <h2>Sesiones encontradas</h2>
     {!sessions.length&&<p className="muted">No hay sesiones registradas para el periodo. Ejecuta la búsqueda para consultar Calendar.</p>}
     {sessions.map(s=><button key={s.id} className={'sessionitem '+(selected===s.id?'selected':'')} onClick={()=>openSession(s.id)}>
      <b>{s.title}</b><small>{lima(s.start_at)}</small>
      <span>{s.read_count}/{s.source_count} fuentes leídas · {s.findings_count} hallazgos</span>
      {s.video_count>0&&<em>{s.video_count} video(s) pendiente(s)</em>}
     </button>)}
    </section>
    <section className="panel sessiondetail">
     {!detail?<div className="empty"><h2>Detalle de sesión</h2><p>Selecciona una sesión para visualizar las fuentes, integraciones, acuerdos y pendientes identificados.</p></div>:<>
      <div className="sectionhead"><h2>{detail.event.title}</h2><a href={detail.event.event_url} target="_blank" rel="noreferrer">Abrir Calendar</a></div>
      <p className="muted">{lima(detail.event.start_at)}</p>
      <div className="toolbar">
       <button onClick={()=>processSelected(false)} disabled={busy||!health?.analysisReady}>{busy?'Procesando...':'Analizar siguientes fragmentos'}</button>
       <button className="light" onClick={()=>processSelected(true)} disabled={busy||!health?.analysisReady}>Reprocesar</button>
      </div>
      {!health?.analysisReady&&<div className="notice">El análisis con IA está deshabilitado hasta configurar el proveedor y obtener la autorización necesaria. La consulta de sesiones sigue disponible.</div>}
      <h3>Fuentes</h3>
      {!detail.sources.length&&<p className="muted">No hay documentos asociados a esta sesión.</p>}
      <div className="sources">{detail.sources.map(s=><div key={s.id} className="source">
       <div><b>{s.title}</b><small>{s.read_status} · {s.processed_chunks}/{s.total_chunks} fragmentos</small></div>
       {s.source_url&&<a href={s.source_url} target="_blank" rel="noreferrer">Fuente</a>}
       {s.error_detail&&<p className="muted">{s.error_detail}</p>}
      </div>)}</div>
      <h3>Hallazgos por integración</h3>
      {!detail.findings.length&&<p className="muted">Aún no hay hallazgos identificados o aprobados para esta sesión.</p>}
      {detail.findings.filter(f=>scope==='Todas'||f.integration===scope).map(f=><article key={f.id} className="finding">
       <div className="findinghead"><b>{f.integration}</b><span>{f.review_status}</span></div>
       <p><b>Hecho:</b> {f.detail}</p>
       {f.agreement&&<p><b>Acuerdo:</b> {f.agreement}</p>}
       {f.pending&&<p><b>Pendiente:</b> {f.owner_team||'Por determinar'}: {f.pending}</p>}
       <p className="evidence"><b>Evidencia:</b> {f.evidence_excerpt} {f.source_url&&<a href={f.source_url} target="_blank" rel="noreferrer">Ver fuente</a>}</p>
       {f.review_status==='Propuesto'&&<div className="decisions">
        <button onClick={()=>decide(f,'Aprobado')} disabled={busy}>Aprobar bitácora</button>
        <button className="light" onClick={()=>decide(f,'Rechazado')} disabled={busy}>Rechazar</button>
       </div>}
      </article>)}
     </>}
    </section>
   </div>}
   {tab==='integrations'&&<section className="panel"><h2>Seguimiento por integración</h2>
    <div className="integrations">{integrations.map(i=><div key={i.id} className="integration">
     <button className="integrationtop" onClick={()=>setShowHistory(showHistory===i.id?null:i.id)}>
      <b>{i.source_numero} · {i.name}</b><span>{i.status} · {i.dependency||'Sin dependencia registrada'}</span>
     </button>
     {showHistory===i.id&&<div className="history"><p>Bitácora histórica importada del Excel y ampliada únicamente con propuestas aprobadas:</p><pre>{i.situational_log||'Sin historial documentado'}</pre></div>}
    </div>)}</div>
   </section>}
   {tab==='pending'&&<section className="panel"><h2>Pendientes por integración ({relevantPending.length})</h2>
    <p className="muted">Pendientes derivados de hallazgos aprobados. La atención o cierre posterior debe acreditarse con nueva evidencia; esta vista no determina por sí sola si siguen abiertos.</p>
    <div className="toolbar"><button className="light" onClick={()=>setTab('sessions')}>Ver sesiones</button><a href="/api/export" className="export">Descargar Excel</a></div>
    {relevantPending.map(f=><article key={f.id} className="finding"><b>{f.integration}</b><p><b>Sesión:</b> {f.session}</p><p><b>Pendiente:</b> {f.pending}</p><p><b>Responsable:</b> {f.owner_team||'Por determinar'}</p>{f.source_url&&<a href={f.source_url} target="_blank" rel="noreferrer">Ver evidencia</a>}</article>)}
   </section>}
  </>}
  <footer>Programa EJE No Penal · Integraciones Laboral · Información de acceso restringido</footer>
 </main>;
}
export default function Home(){return <SessionProvider><Portal/></SessionProvider>}
