import {NextResponse} from 'next/server';
export const dynamic='force-dynamic';
export function GET(){
 const needed=['NEXTAUTH_URL','NEXTAUTH_SECRET','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GEMINI_API_KEY','ALLOWED_EMAIL','MASTER_FILE_ID'];
 const missing=needed.filter(key=>!process.env[key]?.trim());
 return NextResponse.json({ready:missing.length===0,missing,mode:'manual',masterConfigured:!!process.env.MASTER_FILE_ID},{headers:{'Cache-Control':'no-store'}});
}
