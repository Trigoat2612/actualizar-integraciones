import {NextRequest,NextResponse} from 'next/server';
import {authorized} from '../../../lib/security';
import {analyzeSource} from '../../../lib/analysis';
import {cleanError} from '../../../lib/db';
export const runtime='nodejs';export const maxDuration=300;
export async function POST(req:NextRequest){
 const user=await authorized(req);if(!user)return NextResponse.json({error:'Acceso no autorizado'},{status:401});
 try{
  const body=await req.json();
  const eventId=Number(body.eventId),batchId=body.batchId?Number(body.batchId):null;
  if(!Number.isSafeInteger(eventId)||eventId<1)return NextResponse.json({error:'Identificador de sesión inválido'},{status:400});
  if(batchId!==null&&(!Number.isSafeInteger(batchId)||batchId<1))return NextResponse.json({error:'Identificador de lote inválido'},{status:400});
  return NextResponse.json(await analyzeSource(user.accessToken,eventId,String(body.integration||'Todas'),body.force===true,batchId));
 }catch(e){return NextResponse.json({error:cleanError(e)},{status:500})}
}
