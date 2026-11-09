import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

export const authOptions: NextAuthOptions = {
  providers: [GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    authorization: {params: {
      prompt:'consent', access_type:'offline', response_type:'code',
      scope: 'openid email profile https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/drive'
    }}
  })],
  session: {strategy:'jwt',maxAge:60*60*8},
  callbacks: {
    async signIn({profile}) {return !!profile?.email && profile.email.toLowerCase() === (process.env.ALLOWED_EMAIL||'').toLowerCase()},
    async jwt({token,account}) {
      if(account?.access_token) {
        token.googleAccessToken = account.access_token;
        token.googleExpires = (account.expires_at||0)*1000;
        if(account.refresh_token) token.googleRefreshToken=account.refresh_token;
      }
      if(Date.now() < Number(token.googleExpires||0)-60000) return token;
      if (!token.googleRefreshToken) return {...token,googleAccessToken:undefined,error:'Reautenticar'};
      try {
        const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID||'',client_secret:process.env.GOOGLE_CLIENT_SECRET||'',grant_type:'refresh_token',refresh_token:String(token.googleRefreshToken)})});
        const j=await r.json(); if(!r.ok) throw Error(j.error||'Token error');
        return {...token,googleAccessToken:j.access_token,googleExpires:Date.now()+j.expires_in*1000,error:undefined};
      }catch{return {...token,googleAccessToken:undefined,error:'Reautenticar'}}
    },
    async session({session,token}) { if(session.user) session.user.email=token.email; return session }
  },
  pages:{error:'/'}
};
