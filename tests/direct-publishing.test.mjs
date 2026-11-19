import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Solo el usuario autorizado publica, con confirmación, versión y transacción',()=>{
 const api=read('app/api/seguimiento/route.ts');
 assert.match(api,/await authorized\(req\)/);
 assert.match(api,/body\.confirm!==true/);
 assert.match(api,/FOR UPDATE/);
 assert.match(api,/batchId!==String\(body\.batchId/);
 assert.match(api,/await client\.query\('BEGIN'\)/);
 assert.match(api,/await client\.query\('COMMIT'\)/);
 assert.match(api,/await client\.query\('ROLLBACK'\)/);
});
test('La escritura no altera Excel ni modifica filas originales',()=>{
 const api=read('app/api/seguimiento/route.ts');
 assert.match(api,/INSERT INTO public\.tactical_published_overrides/);
 assert.match(api,/dashboard_publications/);
 assert.match(api,/dashboard_published_proposals/);
 assert.doesNotMatch(api,/UPDATE\s+public\.tactical_tracking/i);
 assert.doesNotMatch(api,/UPDATE\s+integraciones_laboral\.integrations/i);
 assert.match(read('db/migration_dashboard_publication.sql'),/PRIMARY KEY \(source_batch_id,source_row\)/);
});
test('La exportación sigue leyendo la publicación consolidada',()=>{
 const readApi=read('lib/publication.ts'),exp=read('app/api/export/route.ts');
 assert.match(readApi,/tactical_published_overrides/);
 assert.match(readApi,/COALESCE\(o\.dependency,t\.dependency\)/);
 assert.match(readApi,/COALESCE\(o\.situational_history,t\.situational_history\)/);
 assert.match(exp,/readPublishedIntegrations/);
 assert.match(exp,/Seguimiento_EJE_Laboral_Neon\.xlsx/);
});
test('Solo nuevas aprobadas, nunca propuestas pendientes, y sin duplicados tras publicar',()=>{
 const api=read('app/api/seguimiento/route.ts');
 assert.match(api,/p\.review_status='Aprobado'/);
 assert.match(api,/dashboard_published_proposals a ON a\.proposal_id=p\.id/);
 assert.match(api,/a\.proposal_id IS NULL/);
 assert.match(api,/p\.approved_at>\(SELECT max/);
 assert.match(api,/existing\.has\(normalize\(line\)\)/);
 assert.match(api,/actualIds\.join\(','\)!==claimedIds\.join\(','\)/);
});
test('Interfaz ofrece cinco campos, guardado por lotes y publicación explícita',()=>{
 const editor=read('app/components/TrackingFieldPublisher.tsx');
 const journal=read('app/components/BitacoraWorkspace.tsx');
 for(const field of ['Dependencia','Cierre de desarrollo','Cierre de pruebas SOFTPLAN / GTI','Validación GSJ','Consideraciones'])
  assert.ok(editor.includes(field),field);
 assert.match(editor,/Guardar cambios para publicar/);
 assert.match(editor,/Publicar en Seguimiento/);
 assert.match(editor,/window\.confirm/);
 assert.match(editor,/revision:string/);
 assert.match(journal,/sourceRow/);
 assert.match(journal,/TrackingFieldPublisher/);
});
