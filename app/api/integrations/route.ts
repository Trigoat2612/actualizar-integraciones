import {NextRequest,NextResponse} from 'next/server';
import {authorized} from '../../../lib/security';
import {db,cleanError} from '../../../lib/db';
import {readPublishedIntegrations} from '../../../lib/publication';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 if(!await authorized(req))return NextResponse.json({error:'No autorizado'},{status:401});
 try{
  const integrations=await readPublishedIntegrations(db());
  return NextResponse.json({integrations,historySource:'excel_publicado_columna_G',sourceLabel:integrations[0]?.source_label,publishedAt:integrations[0]?.published_at},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({error:cleanError(e)},{status:500})}
}
