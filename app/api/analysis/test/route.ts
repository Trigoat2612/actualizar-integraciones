import {NextRequest,NextResponse} from 'next/server';
import {authorized} from '../../../../lib/security';
import {modelAnalyze} from '../../../../lib/analysis';

export const runtime='nodejs';
export const maxDuration=120;
const synthetic= [
 'Acta ficticia de ensayo. Sesión: 09/11/2026.',
 'Se probó la integración SINAREJ - Aranceles con comprobantes de laboratorio sin identificadores reales.',
 'El sistema marcó un comprobante de prueba como utilizado al interrumpir la presentación.',
 'GTI acordó restablecer el estado de ese comprobante de prueba para repetir el escenario.',
 'Softplan acordó comprobar que una presentación interrumpida no bloquee indebidamente el comprobante.',
 'No consta conformidad integral ni cierre de la incidencia.'
].join('\n');
const catalog=['SINAREJ – Aranceles'];
export async function POST(req:NextRequest){
 if(!await authorized(req))return NextResponse.json({error:'Acceso no autorizado'},{status:401});
 try{
  const output=await modelAnalyze(synthetic,catalog,'SESIÓN SINTÉTICA - No es una reunión real','2026-11-09',true);
  const findings=output.filter(f=>{
   if(!f||f.integration!==catalog[0]||typeof f.happened!=='string'||typeof f.evidence!=='string')return false;
   const quote=f.evidence.trim();
   return quote.length>=15&&synthetic.toLowerCase().includes(quote.toLowerCase());
  });
  return NextResponse.json({
   test:'SINTÉTICA',sentRealData:false,persisted:false,provider:'OpenAI',
   model:process.env.ANALYSIS_MODEL||'',validFindings:findings.length,discarded:output.length-findings.length,
   findings:findings.map(f=>({
    integration:f.integration,happened:f.happened,agreement:f.agreement||'',
    pending:f.pending||'',responsible:f.responsible||'Por determinar',evidence:f.evidence
   })),
   checks:{modelResponded:true,expectedIntegration:findings.length>0,evidenceGrounded:findings.length>0},
   nextStep:'La prueba no habilita el tratamiento de sesiones reales; mantiene AI_PROCESSING_APPROVED=false.'
  },{headers:{'Cache-Control':'no-store'}});
 }catch(e){
  // No exponemos claves, encabezados, respuestas sin filtrar ni transcripciones en errores.
  const message=e instanceof Error?e.message:'Fallo de prueba';
  return NextResponse.json({error:message.slice(0,220),test:'SINTÉTICA',persisted:false},{status:500,headers:{'Cache-Control':'no-store'}});
 }
}
