import {NextRequest,NextResponse} from 'next/server';
import {getToken} from 'next-auth/jwt';
import {downloadMaster,googleFetch} from '../../../lib/google';
import {loadWorkbook,updateLocalWorkbook,integrationNames,Finding} from '../../../lib/review';
export const runtime='nodejs';export const maxDuration=300;
export async function POST(req:NextRequest){
 try{
 const token=await getToken({req,secret:process.env.NEXTAUTH_SECRET});
 if(!token?.googleAccessToken || token.email?.toLowerCase() !== process.env.ALLOWED_EMAIL?.toLowerCase())return NextResponse.json({error:'No autorizado'},{status:401});
 const body=await req.json();if(body.confirm!==true)return NextResponse.json({error:'Se requiere aprobación explícita'},{status:400});
 const findings:Finding[]=body.findings||[];if(findings.length>80)return NextResponse.json({error:'Demasiados registros'},{status:400});
 const bearer=String(token.googleAccessToken);const {meta,bytes}=await downloadMaster(bearer);
 if(body.masterModified!==meta.modifiedTime)return NextResponse.json({error:'El archivo maestro cambió desde la revisión. Ejecuta otra revisión antes de actualizar.'},{status:409});
 const wb=await loadWorkbook(bytes);const names=new Set(integrationNames(wb).map(r=>r.name));
 const valid=findings.filter(f=>names.has(f.integration)&&typeof f.date==='string'&&/^\d{4}-\d\d-\d\d$/.test(f.date)&&typeof f.sourceUrl==='string'&&f.sourceUrl.startsWith('https://'));
 const updated=await updateLocalWorkbook(wb,valid,[]);if(!updated.added)return NextResponse.json({success:true,added:0});
 // Google Drive media PATCH overwrites bytes of the *same* Excel file; no new file is created.
 const response=await googleFetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(meta.id)}?uploadType=media`,bearer,{method:'PATCH',headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},body:new Uint8Array(updated.bytes)});
 const result=await response.json().catch(()=>({}));
 const readback=await downloadMaster(bearer);const verify=await loadWorkbook(readback.bytes);const log=verify.getWorksheet('Revisiones asistidas');
 if(!log)return NextResponse.json({error:'La escritura fue recibida, pero falló la verificación de la hoja de historial'},{status:500});
 return NextResponse.json({success:true,added:updated.added,integrations:updated.modifiedIntegrations,verified:true,fileId:result.id||meta.id});
 }catch(err){return NextResponse.json({error:err instanceof Error?err.message:String(err)},{status:500})}
}
