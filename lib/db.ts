import {Pool} from 'pg';
let shared:Pool|undefined;
export function db():Pool{
 const url=process.env.DATABASE_URL;
 if(!url)throw Error('Falta DATABASE_URL');
 if(!shared)shared=new Pool({connectionString:url,max:4,connectionTimeoutMillis:10000,idleTimeoutMillis:10000});
 return shared;
}
export function cleanError(e:unknown){const s=e instanceof Error?e.message:String(e);return /password|authentication|ECONN|ENOTFOUND/i.test(s)?'No se pudo conectar a Neon. Revisa las variables del proyecto.':s.slice(0,300);}
