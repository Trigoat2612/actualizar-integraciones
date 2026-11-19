import type {Pool,PoolClient} from 'pg';

/**
 * El Excel publicado permanece inmutable. Las publicaciones autorizadas se superponen
 * únicamente al lote vigente, nunca a propuestas pendientes ni a otras integraciones.
 */
export type PublishedIntegration={
 id:string;source_numero:string;name:string;status:string;dependency:string;
 criticality:string;situational_log:string;observation:string;environment_enablement:string;
 development_close:string;test_close:string;validation_close:string;
 documentation:string;considerations:string;source_row:number;
 source_batch_id:string;source_label:string;published_at:string|null;last_published_at:string|null;
};
export async function readPublishedIntegrations(pool:Pool|PoolClient):Promise<PublishedIntegration[]>{
 const query=[
  'SELECT i.id::text AS id,i.source_numero,t.integration_name AS name,t.status_raw AS status,',
  'COALESCE(o.dependency,t.dependency) AS dependency,t.criticality_raw AS criticality,',
  'COALESCE(o.situational_history,t.situational_history) AS situational_log,',
  "COALESCE(r.observation,'') AS observation,",
  "COALESCE(r.environment_enablement,'') AS environment_enablement,",
  'COALESCE(o.development_close,t.development_close) AS development_close,',
  'COALESCE(o.tests_close,t.tests_close) AS test_close,',
  'COALESCE(o.gsj_validation,t.gsj_validation) AS validation_close,',
  "COALESCE(r.documentation,'') AS documentation,",
  'COALESCE(o.considerations,t.considerations) AS considerations,',
  't.source_row,t.source_batch_id::text AS source_batch_id,b.source_label,',
  "(SELECT MAX(ev.created_at)::text FROM public.tactical_migration_events ev WHERE ev.batch_id=c.published_batch_id AND ev.event_type='published') AS published_at,",
  "GREATEST(COALESCE((SELECT MAX(ev.created_at) FROM public.tactical_migration_events ev WHERE ev.batch_id=c.published_batch_id AND ev.event_type='published'),'epoch'::timestamptz),",
  "COALESCE((SELECT MAX(z.published_at) FROM public.tactical_published_overrides z WHERE z.source_batch_id=c.published_batch_id),'epoch'::timestamptz))::text AS last_published_at",
  'FROM integraciones_laboral.integrations i',
  'JOIN public.tactical_tracking t ON LOWER(BTRIM(t.integration_name))=LOWER(BTRIM(i.name)) AND t.is_active=TRUE',
  "JOIN public.migration_source_controls c ON c.module_key='resumen_tactico' AND c.active_source='neon'",
  'AND c.neon_read_enabled=TRUE AND t.source_batch_id=c.published_batch_id',
  'JOIN public.migration_batches b ON b.id=c.published_batch_id',
  'LEFT JOIN public.tactical_published_overrides o ON o.source_batch_id=t.source_batch_id AND o.source_row=t.source_row',
  'LEFT JOIN integraciones_laboral.baseline_integration_rows r ON r.integration_id=i.id',
  'AND r.version_id=(SELECT id FROM integraciones_laboral.baseline_versions WHERE active=TRUE ORDER BY imported_at DESC,id DESC LIMIT 1)',
  'ORDER BY i.numero'
 ].join('\n');
 const data=await pool.query<PublishedIntegration>(query),result=data.rows;
 if(result.length!==35||
    new Set(result.map(row=>String(row.id))).size!==35||
    new Set(result.map(row=>Number(row.source_row))).size!==35){
   throw new Error('La publicación Excel no contiene 35 integraciones vinculadas unívocamente. No se mostrarán bitácoras de otra fuente.');
 }
 return result;
}
