import {NextRequest,NextResponse} from 'next/server';
import {authorized} from '../../../lib/security';
import {db,cleanError} from '../../../lib/db';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 if(!await authorized(req))return NextResponse.json({error:'No autorizado'},{status:401});
 try{
  const r=await db().query('SELECT id,source_numero,name,status,dependency,criticality,situational_log FROM integraciones_laboral.integrations ORDER BY numero');
  return NextResponse.json({integrations:r.rows},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({error:cleanError(e)},{status:500})}
}
