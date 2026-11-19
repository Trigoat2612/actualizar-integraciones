-- Publicaciones directas autorizadas sin alterar la copia del Excel.
-- La clave batch+fila impide mezclar ediciones de importaciones diferentes.
CREATE TABLE IF NOT EXISTS public.tactical_published_overrides (
 source_batch_id UUID NOT NULL REFERENCES public.migration_batches(id),
 source_row INTEGER NOT NULL REFERENCES public.tactical_tracking(source_row),
 dependency TEXT NOT NULL DEFAULT '',
 development_close TEXT NOT NULL DEFAULT '',
 tests_close TEXT NOT NULL DEFAULT '',
 gsj_validation TEXT NOT NULL DEFAULT '',
 considerations TEXT NOT NULL DEFAULT '',
 situational_history TEXT NOT NULL DEFAULT '',
 published_by TEXT NOT NULL,
 published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY (source_batch_id,source_row)
);
CREATE INDEX IF NOT EXISTS tactical_published_overrides_latest_idx
 ON public.tactical_published_overrides(source_batch_id,published_at DESC);

CREATE TABLE IF NOT EXISTS integraciones_laboral.dashboard_publications (
 id UUID PRIMARY KEY,
 source_batch_id UUID NOT NULL REFERENCES public.migration_batches(id),
 actor_email TEXT NOT NULL,
 changes JSONB NOT NULL,
 published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK (jsonb_typeof(changes)='array')
);
CREATE INDEX IF NOT EXISTS dashboard_publications_latest_idx
 ON integraciones_laboral.dashboard_publications(source_batch_id,published_at DESC);

CREATE TABLE IF NOT EXISTS integraciones_laboral.dashboard_published_proposals (
 proposal_id BIGINT PRIMARY KEY REFERENCES integraciones_laboral.chatgpt_review_proposals(id),
 publication_id UUID NOT NULL REFERENCES integraciones_laboral.dashboard_publications(id),
 source_batch_id UUID NOT NULL REFERENCES public.migration_batches(id),
 source_row INTEGER NOT NULL,
 published_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dashboard_published_proposals_publication_idx
 ON integraciones_laboral.dashboard_published_proposals(publication_id);
