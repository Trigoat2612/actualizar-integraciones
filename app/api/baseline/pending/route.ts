import {NextRequest,NextResponse} from 'next/server';
import {authorized} from '../../../../lib/security';
import {db,cleanError} from '../../../../lib/db';
import {readPublishedIntegrations} from '../../../../lib/publication';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 if(!await authorized(req))return NextResponse.json({error:'No autorizado'},{status:401});
 try{
  const published=await readPublishedIntegrations(db());
  const historical=published.map(i=>{
   const entries=String(i.situational_log||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
   const last=entries[entries.length-1]||'';
   const withPending=[...entries].reverse().find(e=>/\|\s*Pendiente\s*:/i.test(e));
   const pending=withPending?(withPending.split(/\|\s*Pendiente\s*:/i)[1]||'').trim():'';
   const date=(withPending||last).match(/^((?:\d{1,2}\/\d{1,2})(?:\s*(?:y|al|a|hasta)\s*\d{1,2}\/\d{1,2})?)/)?.[1]||'';
   return {id:i.id,source_numero:i.source_numero,integration:i.name,status:i.status,dependency:i.dependency,
    latest_entry:last,last_pending:pending,last_pending_date:date,source:'Columna G del Excel publicado; no acredita vigencia'};
  });
  return NextResponse.json({historical,withExplicitPending:historical.filter(x=>x.last_pending).length},
   {headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({error:cleanError(e)},{status:500})}
}
