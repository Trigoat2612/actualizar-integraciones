import {NextRequest,NextResponse} from 'next/server';
import {getToken} from 'next-auth/jwt';
import {downloadMaster,calendarEvents,fetchNotes} from '../../../lib/google';
import {loadWorkbook,integrationNames,alreadySeen,extractFindings,updateLocalWorkbook} from '../../../lib/review';
export const runtime='nodejs';
export const maxDuration=300;
export async function POST(req:NextRequest){
 try{
 const token=await getToken({req,secret:process.env.NEXTAUTH_SECRET});
 if(!token?.googleAccessToken || token.email?.toLowerCase() !== process.env.ALLOWED_EMAIL?.toLowerCase())return NextResponse.json({error:'Inicia sesión con la cuenta autorizada'}, {status:401});
 const bearer=String(token.googleAccessToken);const body=await req.json().catch(()=>({}));
 const days=Math.min(14,Math.max(1,Number(body.days)||2));
 const end=new Date();end.setDate(end.getDate()+1);const start=new Date();start.setDate(start.getDate()-days);
 const iso=(v:Date)=>v.toLocaleDateString('en-CA',{timeZone:'America/Lima'});
 const {meta,bytes}=await downloadMaster(bearer),w=await loadWorkbook(bytes),rows=integrationNames(w),seen=alreadySeen(w);
 const all=await calendarEvents(bearer,iso(start),iso(end));const events=all.filter(e=>!seen.has(e.id));
 const docs=await fetchNotes(bearer,events,12);
 const names=rows.map(x=>x.name);let findings=await extractFindings(names,docs);
 const scanned=events.filter(e=>docs.some(d=>d.eventId===e.id&&d.text));
 const draft=await updateLocalWorkbook(w,findings,scanned.map(e=>e.id));
 // Explicit approval required before modifying the existing Drive Excel.
 const uploadData=draft.added?draft.bytes.toString('base64'):null;
 // Do not expose full workbook in a JSON response; store in one-time encrypted memory would not persist on Vercel.
 // Instead return proposed changes, then re-evaluate against live master on explicit confirm endpoint.
 return NextResponse.json({master:meta.name,masterId:meta.id,masterModified:meta.modifiedTime,scannedEvents:scanned.length,foundEvents:all.length,unreviewedEvents:events.length,notesAccessible:docs.filter(d=>d.text).length,notesInaccessible:docs.filter(d=>d.error).length,findings,proposedNewRecords:draft.added,notAutomaticallyWritten:true});
 }catch(err){return NextResponse.json({error:err instanceof Error?err.message:String(err)},{status:500})}
}
