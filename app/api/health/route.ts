import {NextResponse} from 'next/server';
export const dynamic='force-dynamic';
export function GET(){
 const required=['NEXTAUTH_URL','NEXTAUTH_SECRET','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','ALLOWED_EMAIL','DATABASE_URL'];
 const optional=['ANALYSIS_API_URL','ANALYSIS_API_KEY','ANALYSIS_MODEL'];
 const missing=required.filter(n=>!process.env[n]);
 return NextResponse.json({ready:missing.length===0,missing,analysisConfigured:optional.every(n=>!!process.env[n]),analysisReady:optional.every(n=>!!process.env[n])&&process.env.AI_PROCESSING_APPROVED==='true',manualOnly:true,storage:'Neon'},{headers:{'Cache-Control':'no-store'}});
}
