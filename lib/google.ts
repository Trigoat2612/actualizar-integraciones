export async function googleFetch(url:string,token:string,init:RequestInit={}) {
  const r=await fetch(url,{...init,headers:{Authorization:`Bearer ${token}`,...init.headers},cache:'no-store'});
  if(!r.ok)throw Error(`Google API ${r.status}: ${(await r.text()).slice(0,250)}`);
  return r;
}
export function limaIsoDate(d:Date){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)}
export async function downloadMaster(token:string){
 const id=process.env.MASTER_FILE_ID||'';
 const meta=await (await googleFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType,modifiedTime`,token)).json();
 if(meta.mimeType!=='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')throw Error('El maestro cambió de formato; se requiere adaptación');
 const raw=await (await googleFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`,token)).arrayBuffer();
 return {meta,bytes:Buffer.from(raw)};
}
export async function calendarEvents(token:string,start:string,end:string) {
 let page='',all:any[]=[];
 do{
 const p=new URLSearchParams({timeMin:`${start}T00:00:00-05:00`,timeMax:`${end}T00:00:00-05:00`,singleEvents:'true',maxResults:'250',fields:'nextPageToken,items(id,summary,start,description,htmlLink,attachments(fileId,fileUrl,title,mimeType))'});
 if(page)p.set('pageToken',page);
 const data=await (await googleFetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${p}`,token)).json();
 all.push(...(data.items||[]));page=data.nextPageToken||'';
 }while(page&&all.length<1000);
 return all;
}
export async function fetchNotes(token:string,events:any[],limit=12) {
 const docs:any[]=[];
 for(const e of events){
  for(const a of e.attachments||[]){
   if(a.mimeType!=='application/vnd.google-apps.document'||!a.fileId)continue;
   try {const content=await(await googleFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(a.fileId)}/export?mimeType=text%2Fplain`,token)).text();
    docs.push({eventId:e.id,event:e.summary,date:e.start?.dateTime||e.start?.date,url:a.fileUrl||`https://docs.google.com/document/d/${a.fileId}/edit`,text:content.slice(0,38000)});
   }catch(err){docs.push({eventId:e.id,event:e.summary,date:e.start?.dateTime||e.start?.date,url:a.fileUrl||`https://docs.google.com/document/d/${a.fileId}/edit`,error:String(err),text:''})}
   if(docs.length>=limit)return docs;
  }
 }
 return docs;
}
