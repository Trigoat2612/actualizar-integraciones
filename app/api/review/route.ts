import {NextRequest,NextResponse} from 'next/server';
import {getToken} from 'next-auth/jwt';
import {downloadMaster,calendarEvents,fetchNotes} from '../../../lib/google';
import {loadWorkbook,integrationNames,alreadySeen,extractFindings,updateLocalWorkbook} from '../../../lib/review';
export const runtime='nodejs';
export const maxDuration=300;
const dateLima=(d:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
export async function POST(req:NextRequest){
 try{
  const token=await getToken({req,secret:process.env.NEXTAUTH_SECRET});
  if(!token?.googleAccessToken||token.email?.toLowerCase()!==process.env.ALLOWED_EMAIL?.toLowerCase())
   return NextResponse.json({error:'Inicia sesión con la cuenta autorizada'}, {status:401});
  const bearer=String(token.googleAccessToken);
  const body=await req.json().catch(()=>({}));
  const days=Math.min(14,Math.max(1,Number(body.days)||2));
  const selected=String(body.integration||'all').trim();
  const end=new Date();end.setDate(end.getDate()+1);
  const start=new Date();start.setDate(start.getDate()-days);
  const {meta,bytes}=await downloadMaster(bearer),wb=await loadWorkbook(bytes);
  const rows=integrationNames(wb),names=rows.map(x=>x.name);
  if(selected!=='all'&&!names.includes(selected))
   return NextResponse.json({error:'Integración no incluida en el inventario maestro'}, {status:400});
  const all=await calendarEvents(bearer,dateLima(start),dateLima(end));
  const seen=alreadySeen(wb);
  const pending=all.filter(e=>!seen.has(e.id));
  const eventTime=(e:any)=>new Date(e.start?.dateTime||e.start?.date||0).getTime();
  const relevance=(e:any)=>selected==='all'?0:(String(e.summary||'').toLowerCase().includes(selected.toLowerCase())?1:0);
  pending.sort((a,b)=>relevance(b)-relevance(a)||eventTime(b)-eventTime(a));
  const limit=20;
  const docs=await fetchNotes(bearer,pending,limit);
  const findings=await extractFindings(selected==='all'?names:[selected],docs);
  const scannedIds=[...new Set(docs.filter(d=>d.text).map(d=>d.eventId))];
  const draft=await updateLocalWorkbook(wb,findings,scannedIds);
  return NextResponse.json({
   master:meta.name,masterId:meta.id,masterModified:meta.modifiedTime,
   integrations:names,foundEvents:all.length,pendingEvents:pending.length,
   notesAccessible:docs.filter(d=>d.text).length,notesInaccessible:docs.filter(d=>d.error).length,
   documentLimit:limit,documentsAttempted:docs.length,scannedEventIds:scannedIds,
   findings,proposedNewRecords:draft.added,notAutomaticallyWritten:true,
   coverageWarning:docs.length===limit?'Se alcanzó el límite de 20 documentos. Ejecuta otra revisión tras aprobar el lote para continuar.':null
  });
 }catch(err){return NextResponse.json({error:err instanceof Error?err.message:String(err)},{status:500})}
}
