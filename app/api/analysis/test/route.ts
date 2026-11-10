import {NextRequest,NextResponse} from 'next/server';
import {authorized} from '../../../../lib/security';
export const runtime='nodejs';
export async function POST(req:NextRequest){
 if(!await authorized(req))return NextResponse.json({error:'No autorizado'},{status:401});
 return NextResponse.json({error:'La prueba de OpenAI API está deshabilitada. El flujo vigente utiliza ChatGPT y Neon.',mode:'chatgpt-neon'},{status:410,headers:{'Cache-Control':'no-store'}});
}
