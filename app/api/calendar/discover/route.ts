import {NextRequest,NextResponse} from 'next/server';
import {authorized} from '../../../../lib/security';
import {discover} from '../../../../lib/calendar';
import {cleanError} from '../../../../lib/db';
export const runtime='nodejs';export const maxDuration=300;
export async function POST(req:NextRequest){
 const user=await authorized(req);if(!user)return NextResponse.json({error:'Acceso no autorizado'},{status:401});
 try{
  const body=await req.json();
  const from=String(body.from||''),to=String(body.to||'');
  const mode=body.mode==='forzar'?'forzar':'incremental';
  const integration=String(body.integration||'Todas').slice(0,160);
  const result=await discover(user.accessToken,from,to,mode,integration);
  return NextResponse.json(result);
 }catch(e){return NextResponse.json({error:cleanError(e)},{status:500})}
}
