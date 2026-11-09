import type {NextRequest} from 'next/server';
import {getToken} from 'next-auth/jwt';
export async function authorized(req:NextRequest){
 if(!process.env.NEXTAUTH_SECRET||!process.env.ALLOWED_EMAIL)return null;
 const token=await getToken({req,secret:process.env.NEXTAUTH_SECRET});
 if(!token?.googleAccessToken||String(token.email||'').toLowerCase()!==process.env.ALLOWED_EMAIL.toLowerCase())return null;
 return {email:String(token.email),accessToken:String(token.googleAccessToken)};
}
