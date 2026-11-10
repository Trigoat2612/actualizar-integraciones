import {NextRequest,NextResponse} from 'next/server';
import {authorized} from '../../../../lib/security';
import {db,cleanError} from '../../../../lib/db';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 if(!await authorized(req))return NextResponse.json({error:'No autorizado'},{status:401});
 try{
  const r=await db().query('SELECT id,source_numero,name,status,dependency,situational_log FROM integraciones_laboral.integrations ORDER BY numero');
  const historical=r.rows.map(i=>{
   const entries=String(i.situational_log||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
   const last=entries[entries.length-1]||'';
   const withPending=[...entries].reverse().find(e=>/\|\s*Pendiente\s*:/i.test(e));
   const pending=withPending?(withPending.split(/\|\s*Pendiente\s*:/i)[1]||'').trim():'';
   const date=(withPending||last).match(/(?:^|\s)(\d{1,2}\/\d{2})(?:\s|-)/)?.[1]||'';
   return {id:i.id,source_numero:i.source_numero,integration:i.name,status:i.status,dependency:i.dependency,
    latest_entry:last,last_pending:pending,last_pending_date:date,source:'Bitácora histórica; no acredita vigencia'};
  });
  return NextResponse.json({historical,withExplicitPending:historical.filter(x=>x.last_pending).length},
   {headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({error:cleanError(e)},{status:500})}
}
