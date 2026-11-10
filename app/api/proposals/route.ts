import {NextRequest,NextResponse} from 'next/server';
import {authorized} from '../../../lib/security';
import {db,cleanError} from '../../../lib/db';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 if(!await authorized(req))return NextResponse.json({error:'No autorizado'},{status:401});
 try{
  const pool=db(),p=req.nextUrl.searchParams,from=p.get('from'),to=p.get('to');
  const params:unknown[]=[];let where='';
  if(from&&to){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)
    return NextResponse.json({error:'Fecha inválida'},{status:400});
   where='WHERE p.observed_on >= $1::date AND p.observed_on <= $2::date';params.push(from,to);
  }
  const r=await pool.query('SELECT p.id,p.integration_id,i.name AS integration,p.event_id,p.observed_on,p.source_name,p.source_url,p.detail,p.agreement,p.pending,p.responsible,p.evidence_quote,p.proposed_status,p.source_kind,p.review_status,p.created_at FROM integraciones_laboral.chatgpt_review_proposals p JOIN integraciones_laboral.integrations i ON i.id=p.integration_id '+where+' ORDER BY p.observed_on DESC,p.id DESC LIMIT 1000',params);
  return NextResponse.json({proposals:r.rows,manualApprovalRequired:true},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({error:cleanError(e)},{status:500})}
}
