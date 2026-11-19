import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('El editor exige autorización, estado Propuesto y versión original',()=>{
 const route=read('app/api/proposals/[id]/route.ts');
 assert.match(route,/export async function PATCH\(/);
 assert.match(route,/await authorized\(req\)/);
 assert.match(route,/p\.review_status|old\.review_status!=='Propuesto'/);
 assert.match(route,/old\.fingerprint!==expectedFingerprint/);
 assert.match(route,/FOR UPDATE/);
 assert.match(route,/expectedFingerprint/);
});

test('Las ediciones dejan un antes/después y no alteran la columna G',()=>{
 const route=read('app/api/proposals/[id]/route.ts');
 const migration=read('db/migration_proposal_edits.sql');
 assert.match(route,/chatgpt_proposal_edit_audit/);
 assert.match(route,/before_data,after_data,actor_email,reason/);
 assert.match(route,/publishedToExcel:false/);
 assert.doesNotMatch(route,/UPDATE\s+(?:public\.)?tactical_tracking/i);
 assert.doesNotMatch(route,/UPDATE\s+integraciones_laboral\.integrations/i);
 assert.match(migration,/CREATE TABLE IF NOT EXISTS integraciones_laboral\.chatgpt_proposal_edit_audit/);
 assert.match(migration,/REFERENCES integraciones_laboral\.chatgpt_review_proposals/);
});

test('Una propuesta decidida no puede modificarse',()=>{
 const route=read('app/api/proposals/[id]/route.ts');
 assert.match(route,/Solo se pueden editar propuestas sin aprobar o rechazar/);
 assert.match(route,/review_status='Propuesto'/);
});

test('La interfaz ofrece editar, guardar, cancelar, vista previa y fuente',()=>{
 const source=read('app/components/BitacoraWorkspace.tsx');
 for(const phrase of ['startEditing','saveEdit','Guardar cambios','Cancelar','Vista previa de la anotación','Motivo del ajuste','sourceName','evidenceQuote'])
  assert.match(source,new RegExp(phrase));
 assert.match(source,/method:'PATCH'/);
 assert.match(source,/expectedFingerprint/);
 assert.match(source,/edit_count/);
});

test('Solo se preparan propuestas aprobadas posteriores a la publicación',()=>{
 const source=read('app/components/BitacoraWorkspace.tsx');
 const get=read('app/api/proposals/route.ts');
 assert.match(source,/p\.review_status==='Aprobado'/);
 assert.match(source,/new Date\(p\.approved_at as string\)\.getTime\(\)>new Date\(active\?\.published_at as string\)\.getTime\(\)/);
 assert.match(source,/linesToPublish/);
 assert.match(source,/existingLines\.has/);
 assert.match(source,/Copiar columna G con/);
 assert.match(source,/publica una nueva versión/);
 assert.match(get,/p\.approved_at,p\.fingerprint/);
});
