-- Migración aditiva del actualizador de Calendar. PostgreSQL (Neon).
-- Se asume existente integraciones_laboral.integrations con las 35 integraciones.
-- No altera ni elimina los datos del catálogo.

BEGIN;
CREATE SCHEMA IF NOT EXISTS integraciones_laboral;

CREATE TABLE IF NOT EXISTS integraciones_laboral.calendar_events (
 id BIGSERIAL PRIMARY KEY,
 calendar_id TEXT NOT NULL DEFAULT 'primary',
 event_id TEXT NOT NULL,
 title TEXT NOT NULL DEFAULT '',
 start_at TIMESTAMPTZ NOT NULL,
 end_at TIMESTAMPTZ,
 event_url TEXT NOT NULL DEFAULT '',
 event_status TEXT NOT NULL DEFAULT 'confirmed',
 google_updated_at TIMESTAMPTZ,
 last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(calendar_id,event_id)
);

CREATE TABLE IF NOT EXISTS integraciones_laboral.calendar_event_sources (
 id BIGSERIAL PRIMARY KEY,
 event_id BIGINT NOT NULL REFERENCES integraciones_laboral.calendar_events(id),
 file_id TEXT NOT NULL,
 title TEXT NOT NULL DEFAULT '',
 source_url TEXT NOT NULL DEFAULT '',
 mime_type TEXT NOT NULL DEFAULT '',
 google_modified_at TIMESTAMPTZ,
 sha256 TEXT,
 read_status TEXT NOT NULL DEFAULT 'Pendiente',
 read_at TIMESTAMPTZ,
 error_detail TEXT NOT NULL DEFAULT '',
 processed_chunks INTEGER NOT NULL DEFAULT 0,
 total_chunks INTEGER NOT NULL DEFAULT 0,
 content_length INTEGER NOT NULL DEFAULT 0,
 last_analyzed_at TIMESTAMPTZ,
 UNIQUE(event_id,file_id)
);

CREATE TABLE IF NOT EXISTS integraciones_laboral.analysis_batches (
 id BIGSERIAL PRIMARY KEY,
 requested_from DATE NOT NULL,
 requested_to DATE NOT NULL,
 mode TEXT NOT NULL DEFAULT 'incremental',
 integration_filter TEXT NOT NULL DEFAULT 'Todas',
 found_events INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'Descubriendo',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 finished_at TIMESTAMPTZ,
 last_progress_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS integraciones_laboral.analysis_session_results (
 id BIGSERIAL PRIMARY KEY,
 batch_id BIGINT REFERENCES integraciones_laboral.analysis_batches(id),
 event_id BIGINT NOT NULL REFERENCES integraciones_laboral.calendar_events(id),
 status TEXT NOT NULL DEFAULT 'Pendiente',
 notes_read INTEGER NOT NULL DEFAULT 0,
 notes_failed INTEGER NOT NULL DEFAULT 0,
 video_pending INTEGER NOT NULL DEFAULT 0,
 summary TEXT NOT NULL DEFAULT '',
 reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(batch_id,event_id)
);

CREATE TABLE IF NOT EXISTS integraciones_laboral.integration_findings (
 id BIGSERIAL PRIMARY KEY,
 event_id BIGINT NOT NULL REFERENCES integraciones_laboral.calendar_events(id),
 source_id BIGINT NOT NULL REFERENCES integraciones_laboral.calendar_event_sources(id),
 integration_id BIGINT NOT NULL REFERENCES integraciones_laboral.integrations(id),
 source_sha256 TEXT NOT NULL,
 happened_on DATE NOT NULL,
 detail TEXT NOT NULL,
 agreement TEXT NOT NULL DEFAULT '',
 pending TEXT NOT NULL DEFAULT '',
 owner_team TEXT NOT NULL DEFAULT '',
 proposed_status TEXT NOT NULL DEFAULT '',
 evidence_excerpt TEXT NOT NULL DEFAULT '',
 review_status TEXT NOT NULL DEFAULT 'Propuesto',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 fingerprint TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS integraciones_laboral.approval_audit (
 id BIGSERIAL PRIMARY KEY,
 finding_id BIGINT NOT NULL REFERENCES integraciones_laboral.integration_findings(id),
 decision TEXT NOT NULL,
 reason TEXT NOT NULL DEFAULT '',
 actor_email TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS calendar_events_start_idx ON integraciones_laboral.calendar_events(start_at DESC);
CREATE INDEX IF NOT EXISTS calendar_sources_event_idx ON integraciones_laboral.calendar_event_sources(event_id,read_status);
CREATE INDEX IF NOT EXISTS findings_event_idx ON integraciones_laboral.integration_findings(event_id,created_at DESC);
CREATE INDEX IF NOT EXISTS findings_integration_idx ON integraciones_laboral.integration_findings(integration_id,happened_on DESC);
CREATE INDEX IF NOT EXISTS findings_status_idx ON integraciones_laboral.integration_findings(review_status);
CREATE UNIQUE INDEX IF NOT EXISTS audit_finding_decision_idx ON integraciones_laboral.approval_audit(finding_id,decision) WHERE decision IN ('Aprobado','Rechazado');
COMMIT;
