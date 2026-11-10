import {NextRequest,NextResponse} from 'next/server';
import {authorized} from '../../../lib/security';
export const runtime='nodejs';
export async function POST(req:NextRequest){
 if(!await authorized(req))return NextResponse.json({error:'No autorizado'},{status:401});
 return NextResponse.json({error:'El análisis mediante OpenAI API está deshabilitado. Solicita la revisión por fecha desde ChatGPT; las propuestas se registran en Neon y se aprueban en el portal.',mode:'chatgpt-neon'},{status:410,headers:{'Cache-Control':'no-store'}});
}
