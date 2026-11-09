import {createHash} from 'node:crypto';
import {db} from './db';
import {googleFetch,validDate,dayAfter} from './google';
type Attachment={fileId?:string;fileUrl?:string;title?:string;mimeType?:string};
type Event={id:string;summary?:string;status?:string;updated?:string;htmlLink?:string;description?:string;start?:{date?:string;dateTime?:string};end?:{date?:string;dateTime?:string};attachments?:Attachment[]};
export function sha(v:string){return createHash('sha256').update(v).digest('hex')}
export function checkRange(from:string,to:string){
 if(!validDate(from)||!validDate(to)||from>to)throw Error('Rango de fechas inválido');
 if((Date.parse(to)-Date.parse(from))/86400000>366)throw Error('El rango no puede superar 367 días');
}
function localStart(s:string){return s.length===10?s+'T00:00:00-05:00':s}
function attachments(e:Event){
 const out=new Map<string,Attachment>();
 for(const a of e.attachments||[])if(a.fileId)out.set(a.fileId,a);
 const urls=String(e.description||'').match(/https:\/\/(?:docs\.google\.com\/document\/d\/|drive\.google\.com\/file\/d\/)[A-Za-z0-9_-]+/g)||[];
 for(const url of urls){const id=url.split('/d/')[1];if(id&&!out.has(id))out.set(id,{fileId:id,fileUrl:url,title:'Enlace de la descripción',mimeType:url.includes('docs.google.com')?'application/vnd.google-apps.document':'video/mp4'})}
 return [...out.values()];
}
export async function calendarList(token:string,from:string,to:string){
 checkRange(from,to);
 let page='';const all:Event[]=[];
 do{
  const params=new URLSearchParams({timeMin:from+'T00:00:00-05:00',timeMax:dayAfter(to)+'T00:00:00-05:00',maxResults:'2500',singleEvents:'true',showDeleted:'false',fields:'nextPageToken,items(id,summary,status,updated,htmlLink,description,start,end,attachments)'});
  if(page)params.set('pageToken',page);
  const result=await (await googleFetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?'+params.toString(),token)).json();
  all.push(...(result.items||[]));page=result.nextPageToken||'';
 }while(page);return all;
}
async function version(token:string,id:string){
 try{const r=await (await googleFetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?fields=id,name,mimeType,modifiedTime',token)).json();return {modified:r.modifiedTime||null,mime:r.mimeType||'',name:r.name||''}}
 catch{return {modified:null,mime:'',name:''}}
}
export async function discover(token:string,from:string,to:string,mode:string,filter:string){
 const events=await calendarList(token,from,to),pool=db();
 const batch=(await pool.query('INSERT INTO integraciones_laboral.analysis_batches(requested_from,requested_to,mode,integration_filter,status,found_events) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[from,to,mode,filter,'Registrado',events.length])).rows[0].id;
 let sourceCount=0,metadataUnavailable=0;
 for(const e of events){
  const start=e.start?.dateTime||e.start?.date;if(!e.id||!start)continue;
  const id=(await pool.query("INSERT INTO integraciones_laboral.calendar_events(calendar_id,event_id,title,start_at,end_at,event_url,event_status,google_updated_at,last_seen_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW()) ON CONFLICT(calendar_id,event_id) DO UPDATE SET title=EXCLUDED.title,start_at=EXCLUDED.start_at,end_at=EXCLUDED.end_at,event_url=EXCLUDED.event_url,event_status=EXCLUDED.event_status,google_updated_at=EXCLUDED.google_updated_at,last_seen_at=NOW() RETURNING id",['primary',e.id,e.summary||'Sin título',localStart(start),e.end?.dateTime||e.end?.date?localStart(String(e.end?.dateTime||e.end?.date)):null,e.htmlLink||'',e.status||'confirmed',e.updated||null])).rows[0].id;
  for(const a of attachments(e)){
   if(!a.fileId)continue;
   const meta=await version(token,a.fileId);if(!meta.modified)metadataUnavailable++;
   const mime=meta.mime||a.mimeType||'';
   const status=mime.startsWith('video/')?'Vídeo pendiente':'Pendiente';
   await pool.query("INSERT INTO integraciones_laboral.calendar_event_sources(event_id,file_id,title,source_url,mime_type,google_modified_at,read_status) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(event_id,file_id) DO UPDATE SET title=EXCLUDED.title,source_url=EXCLUDED.source_url,mime_type=EXCLUDED.mime_type,read_status=CASE WHEN EXCLUDED.google_modified_at IS NOT NULL AND integraciones_laboral.calendar_event_sources.google_modified_at IS DISTINCT FROM EXCLUDED.google_modified_at AND integraciones_laboral.calendar_event_sources.read_status IN ('Leída','Parcial') THEN 'Revisión necesaria' ELSE integraciones_laboral.calendar_event_sources.read_status END,google_modified_at=COALESCE(EXCLUDED.google_modified_at,integraciones_laboral.calendar_event_sources.google_modified_at)",[id,a.fileId,meta.name||a.title||'Adjunto',a.fileUrl||'',mime,meta.modified,status]);
   sourceCount++;
  }
 }
 return {batchId:Number(batch),found:events.length,attachmentReferences:sourceCount,metadataUnavailable};
}
