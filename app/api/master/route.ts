import {NextRequest,NextResponse} from 'next/server';
import {getToken} from 'next-auth/jwt';
import {downloadMaster,googleFetch} from '../../../lib/google';
import {loadWorkbook,updateLocalWorkbook,integrationNames,Finding} from '../../../lib/review';
export const runtime='nodejs'; export const maxDuration=300;
export async function POST(req:NextRequest){
 try{
  const token=await getToken({req,secret:process.env.NEXTAUTH_SECRET});
  if(!token?.googleAccessToken||token.email?.toLowerCase()!==process.env.ALLOWED_EMAIL?.toLowerCase())
   return NextResponse.json({error:'No autorizado'},{status:401});
  const body=await req.json();
  if(body.confirm!==true)return NextResponse.json({error:'Se requiere aprobación explícita'},{status:400});
  const findings:Finding[]=Array.isArray(body.findings)?body.findings:[];
  if(findings.length>80)return NextResponse.json({error:'Demasiados registros'},{status:400});
  const bearer=String(token.googleAccessToken);
  const {meta,bytes}=await downloadMaster(bearer);
  if(body.masterModified!==meta.modifiedTime)
   return NextResponse.json({error:'El archivo maestro cambió desde la revisión. Ejecuta otra revisión antes de actualizar.'},{status:409});
  const workbook=await loadWorkbook(bytes);
  const names=new Set(integrationNames(workbook).map(r=>r.name));
  const valid=findings.filter(f=>f&&names.has(f.integration)&&
   typeof f.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(f.date)&&
   typeof f.sourceUrl==='string'&&/^https:\/\/docs\.google\.com\/document\/d\//.test(f.sourceUrl)&&
   typeof f.happened==='string'&&f.happened.trim().length>=12 &&
   typeof f.agreed==='string'&&typeof f.pending==='string'&&typeof f.responsible==='string');
  if(valid.length!==findings.length)
   return NextResponse.json({error:'Hay registros sin evidencia o con datos inválidos. No se ha escrito el maestro.'},{status:400});
  const scannedIds=Array.isArray(body.scannedEventIds)?body.scannedEventIds.filter((x:any)=>typeof x==='string'&&x.length<400).slice(0,100):[];
  const updated=await updateLocalWorkbook(workbook,valid,valid.length?scannedIds:[]);
  if(!updated.added)return NextResponse.json({success:true,added:0,verified:true});
  await googleFetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(meta.id)}?uploadType=media`,bearer,{
   method:'PATCH',headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},
   body:new Uint8Array(updated.bytes)});
  const readback=await downloadMaster(bearer);const verified=await loadWorkbook(readback.bytes);
  const history=verified.getWorksheet('Revisiones asistidas');
  if(!history)return NextResponse.json({error:'La escritura fue recibida, pero falló la verificación del historial'},{status:500});
  const written=new Set<string>();
  history.eachRow((r,n)=>{if(n>1)written.add(`${r.getCell(2).text}|${r.getCell(3).text}|${r.getCell(11).text}|${r.getCell(5).text.trim().toLowerCase()}`)});
  const fullyVerified=valid.every(f=>written.has(`${f.integration}|${f.date}|${f.sourceUrl}|${f.happened.trim().toLowerCase()}`));
  if(!fullyVerified)return NextResponse.json({error:'No se pudo verificar la totalidad de los cambios después de la escritura'},{status:500});
  return NextResponse.json({success:true,added:updated.added,integrations:updated.modifiedIntegrations,verified:true,fileId:meta.id});
 }catch(err){return NextResponse.json({error:err instanceof Error?err.message:String(err)},{status:500})}
}
