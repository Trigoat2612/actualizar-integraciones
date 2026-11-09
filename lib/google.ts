export async function googleFetch(url:string,token:string,init:RequestInit={}){
 const r=await fetch(url,{...init,cache:'no-store',headers:{Authorization:'Bearer '+token,...init.headers}});
 if(!r.ok)throw Error('Google API '+r.status+': '+(await r.text()).slice(0,200));return r;
}
export function validDate(v:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const [y,m,d]=v.split('-').map(Number);return new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10)===v;
}
export function dayAfter(v:string){const [y,m,d]=v.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+1)).toISOString().slice(0,10)}
export function localDay(v:string){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v))}
