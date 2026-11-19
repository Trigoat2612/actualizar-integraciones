import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const text=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('La lectura maestra usa solo el lote Excel publicado y la columna G',()=>{
 const source=text('lib/publication.ts');
 assert.match(source,/COALESCE\(o\.situational_history,t\.situational_history\) AS situational_log/);
 assert.match(source,/t\.source_batch_id=c\.published_batch_id/);
 assert.match(source,/LOWER\(BTRIM\(t\.integration_name\)\)=LOWER\(BTRIM\(i\.name\)\)/);
 assert.match(source,/result\.length!==35/);
 assert.doesNotMatch(source,/t\.source_row\s*=\s*i\.numero/);
 assert.doesNotMatch(source,/i\.situational_log AS situational_log/);
 assert.match(source,/tactical_published_overrides/);
});

test('El historial, los pendientes y la exportación consultan la fuente publicada',()=>{
 for(const file of [
  'app/api/integrations/route.ts',
  'app/api/export/route.ts',
  'app/api/baseline/pending/route.ts'
 ])assert.match(text(file),/readPublishedIntegrations/);
 const integration=text('app/api/integrations/route.ts');
 assert.match(integration,/historySource:'excel_publicado_columna_G'/);
 const exportApi=text('app/api/export/route.ts');
 assert.match(exportApi,/rows:cat\.map/);
 assert.doesNotMatch(exportApi,/rows:cat\.rows\.map/);
});

test('Aprobar propuestas no incorpora texto al registro oficial',()=>{
 const decision=text('app/api/proposals/[id]/decision/route.ts');
 assert.match(decision,/publishedToExcel:false/);
 assert.match(decision,/chatgpt_proposal_audit/);
 assert.doesNotMatch(decision,/UPDATE integraciones_laboral\.integrations SET situational_log/);
});

test('Importar nueva línea base no concatena propuestas ni texto anterior',()=>{
 const baseline=text('app/api/baseline/route.ts');
 assert.match(baseline,/const updatedLog=row\.situational_log/);
 assert.doesNotMatch(baseline,/const additions=current\.slice/);
 assert.match(baseline,/baseline_catalog_backups/);
});

test('Captura de propuestas coteja duplicados con el Excel publicado',()=>{
 const proposals=text('app/api/proposals/route.ts');
 assert.match(proposals,/t\.situational_history AS situational_log/);
 assert.match(proposals,/t\.source_batch_id=c\.published_batch_id/);
 assert.match(proposals,/ON CONFLICT\(fingerprint\) DO NOTHING/);
});

test('Lector contempla fechas combinadas y evita etiquetas de estado implícito',()=>{
 const journal=text('app/components/BitacoraWorkspace.tsx');
 assert.match(journal,/const journalHeading=/);
 assert.match(journal,/last.*sortKey|sortKey/);
 assert.doesNotMatch(journal,/>Pendiente citado</);
 assert.match(journal,/La columna G oficial sigue intacta/);
});
