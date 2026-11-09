import {NextRequest,NextResponse} from 'next/server';
import {getToken} from 'next-auth/jwt';
import {downloadMaster} from '../../../lib/google';
import {loadWorkbook,integrationNames} from '../../../lib/review';
export const runtime='nodejs';
export async function GET(req:NextRequest){
 try{
  const token=await getToken({req,secret:process.env.NEXTAUTH_SECRET});
  if(!token?.googleAccessToken||token.email?.toLowerCase()!==process.env.ALLOWED_EMAIL?.toLowerCase())
   return NextResponse.json({error:'No autorizado'},{status:401});
  const {bytes}=await downloadMaster(String(token.googleAccessToken));
  const wb=await loadWorkbook(bytes);
  return NextResponse.json({integrations:integrationNames(wb).map(r=>r.name)},{headers:{'Cache-Control':'no-store'}});
 }catch(err){return NextResponse.json({error:err instanceof Error?err.message:String(err)},{status:500})}
}
