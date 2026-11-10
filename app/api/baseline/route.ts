import {NextRequest,NextResponse} from 'next/server';
import {authorized} from '../../../lib/security';
import {db,cleanError} from '../../../lib/db';
import {readBaseline,numbered,normalizeName} from '../../../lib/baseline';

export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=120;
const schema='integraciones_laboral';

export async function GET(req:NextRequest){
 const user=await authorized(req);if(!user)return NextResponse.json({error:'No autorizado'},{status:401});
 try{
  const pool=db();
  const [versions,rows,coverage]=await Promise.all([
   pool.query('SELECT id,source_filename,file_sha256,row_count,imported_at,active FROM '+schema+'.baseline_versions ORDER BY imported_at DESC LIMIT 5'),
   pool.query('SELECT count(*)::int AS n FROM '+schema+'.baseline_integration_rows'),
   pool.query('SELECT status,count(*)::int AS total FROM '+schema+'.calendar_reconciliations GROUP BY status ORDER BY status')
  ]);
  return NextResponse.json({versions:versions.rows,baselineRows:rows.rows[0].n,coverage:coverage.rows,importRequiresApproval:true},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({error:cleanError(e)},{status:500})}
}

export async function POST(req:NextRequest){
 const user=await authorized(req);if(!user)return NextResponse.json({error:'No autorizado'},{status:401});
 try{
  const form=await req.formData(),file=form.get('file');
  if(!(file instanceof File))return NextResponse.json({error:'Adjunta Lista_Integraciones_base.xlsx'},{status:400});
  const name=file.name;
  if(name!=='Lista_Integraciones_base.xlsx')return NextResponse.json({error:'El archivo debe conservar el nombre Lista_Integraciones_base.xlsx'},{status:400});
  if(file.size>5_000_000)return NextResponse.json({error:'Archivo demasiado grande'},{status:400});
  const data=await readBaseline(Buffer.from(await file.arrayBuffer()));
  const pool=db();
  const current=(await pool.query('SELECT id,source_numero,name,status,dependency,criticality,situational_log FROM '+schema+'.integrations ORDER BY numero')).rows;
  const mapping=new Map(current.map(r=>[numbered(String(r.source_numero)),r]));
  const unmatched=data.rows.filter(r=>!mapping.has(numbered(r.source_numero))||
   normalizeName(String(mapping.get(numbered(r.source_numero))?.name||''))!==normalizeName(r.source_name));
  if(unmatched.length||current.length!==35)
   return NextResponse.json({error:'No coinciden las 35 integraciones. Se canceló la importación sin cambios.',unmatched:unmatched.map(r=>r.source_numero+' · '+r.source_name)},{status:409});
  const differences=data.rows.flatMap(r=>{
   const old=mapping.get(numbered(r.source_numero));
   if(!old)return [];
   const columns=[
    ['Estado',String(old.status||''),r.status],
    ['Dependencia',String(old.dependency||''),r.dependency],
    ['Criticidad',String(old.criticality||''),r.criticality],
    ['Estado Situacional',String(old.situational_log||''),r.situational_log]
   ] as const;
   return columns.filter(([,a,b])=>a.trimEnd()!==b.trimEnd()).map(([column,a,b])=>
    ({integration:r.source_name,number:r.source_numero,column,oldLength:a.length,newLength:b.length,
      oldExcerpt:a.slice(-180),newExcerpt:b.slice(-180)}));
  });
  const confirm=form.get('confirm')==='true';
  if(!confirm)return NextResponse.json({preview:true,hash:data.hash,rows:data.rows.length,
   differences,canApply:true,warning:'Importar sustituirá únicamente los valores maestros de las 35 integraciones; conservará una copia anterior auditable y todo el historial de aprobaciones.'});
  if(form.get('hash')!==data.hash)return NextResponse.json({error:'La confirmación no coincide con el archivo revisado'},{status:409});
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   await client.query('SELECT pg_advisory_xact_lock(2026110901)');
   const old=(await client.query('SELECT id FROM '+schema+'.baseline_versions WHERE active=true ORDER BY id DESC LIMIT 1')).rows[0];
   const prior=(await client.query('SELECT id,source_numero,name,status,dependency,criticality,situational_log FROM '+schema+'.integrations FOR UPDATE')).rows;
   await client.query('UPDATE '+schema+'.baseline_versions SET active=false WHERE active=true');
   const version=(await client.query(
    'INSERT INTO '+schema+'.baseline_versions(source_filename,file_sha256,row_count,imported_by,active) VALUES($1,$2,35,$3,true) ON CONFLICT(file_sha256) DO UPDATE SET active=true RETURNING id',
    [name,data.hash,user.email])).rows[0];
   await client.query('DELETE FROM '+schema+'.baseline_integration_rows WHERE version_id=$1',[version.id]);
   // Solo almacenamos un respaldo si el contenido maestro de este lote no había sido respaldado.
   await client.query('INSERT INTO '+schema+'.baseline_catalog_backups(baseline_version_id,previous_baseline_id,catalog_json,actor_email) VALUES($1,$2,$3::jsonb,$4)',
    [version.id,old?.id||null,JSON.stringify(prior),user.email]);
   for(const row of data.rows){
    const master=mapping.get(numbered(row.source_numero));
    if(!master)throw Error('Integración no reconocida: '+row.source_numero);
    await client.query(
     'INSERT INTO '+schema+'.baseline_integration_rows(version_id,integration_id,source_numero,source_name,observation,status,dependency,environment_enablement,situational_log,development_close,test_close,validation_close,documentation,criticality,considerations,excel_row_number) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',
     [version.id,master.id,row.source_numero,row.source_name,row.observation,row.status,row.dependency,row.environment_enablement,row.situational_log,row.development_close,row.test_close,row.validation_close,row.documentation,row.criticality,row.considerations,row.excel_row_number]);
    await client.query('UPDATE '+schema+'.integrations SET status=$1,dependency=$2,criticality=$3,situational_log=$4,updated_at=NOW() WHERE id=$5',
     [row.status,row.dependency,row.criticality,row.situational_log,master.id]);
   }
   // La conciliación previa se conserva con su versión de origen; la nueva base requiere nuevo cotejo.
   await client.query('COMMIT');
   return NextResponse.json({imported:true,versionId:version.id,rows:35,differencesApplied:differences.length,backupCreated:true},{headers:{'Cache-Control':'no-store'}});
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
 }catch(e){return NextResponse.json({error:cleanError(e)},{status:500})}
}
