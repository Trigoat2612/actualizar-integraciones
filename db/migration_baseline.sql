-- Revisión incremental: Excel oficial, cobertura de Calendar y propuestas de ChatGPT.
-- Migración aditiva. No modifica registros maestros ni bitácoras existentes.
BEGIN;
CREATE TABLE IF NOT EXISTS integraciones_laboral.baseline_versions (
 id BIGSERIAL PRIMARY KEY,
 source_filename TEXT NOT NULL,
 file_sha256 TEXT NOT NULL UNIQUE,
 row_count INTEGER NOT NULL CHECK (row_count=35),
 imported_by TEXT NOT NULL,
 imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 active BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX IF NOT EXISTS baseline_one_active_idx
 ON integraciones_laboral.baseline_versions(active) WHERE active;
CREATE TABLE IF NOT EXISTS integraciones_laboral.baseline_integration_rows (
 version_id BIGINT NOT NULL REFERENCES integraciones_laboral.baseline_versions(id),
 integration_id BIGINT NOT NULL REFERENCES integraciones_laboral.integrations(id),
 source_numero TEXT NOT NULL,
 source_name TEXT NOT NULL,
 observation TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT '',
 dependency TEXT NOT NULL DEFAULT '',
 environment_enablement TEXT NOT NULL DEFAULT '',
 situational_log TEXT NOT NULL DEFAULT '',
 development_close TEXT NOT NULL DEFAULT '',
 test_close TEXT NOT NULL DEFAULT '',
 validation_close TEXT NOT NULL DEFAULT '',
 documentation TEXT NOT NULL DEFAULT '',
 criticality TEXT NOT NULL DEFAULT '',
 considerations TEXT NOT NULL DEFAULT '',
 excel_row_number INTEGER NOT NULL,
 PRIMARY KEY(version_id,integration_id)
);
CREATE TABLE IF NOT EXISTS integraciones_laboral.baseline_catalog_backups (
 id BIGSERIAL PRIMARY KEY,
 baseline_version_id BIGINT NOT NULL REFERENCES integraciones_laboral.baseline_versions(id),
 previous_baseline_id BIGINT REFERENCES integraciones_laboral.baseline_versions(id),
 catalog_json JSONB NOT NULL,
 actor_email TEXT NOT NULL,
 backed_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS baseline_backups_version_idx
 ON integraciones_laboral.baseline_catalog_backups(baseline_version_id);
CREATE TABLE IF NOT EXISTS integraciones_laboral.calendar_reconciliations (
 event_id BIGINT PRIMARY KEY REFERENCES integraciones_laboral.calendar_events(id),
 baseline_version_id BIGINT NOT NULL REFERENCES integraciones_laboral.baseline_versions(id),
 status TEXT NOT NULL DEFAULT 'Por cotejar'
 CHECK (status IN ('Por cotejar','Cubierta en base','Omisión detectada','Fuera de alcance')),
 integration_ids BIGINT[] NOT NULL DEFAULT ARRAY[]::BIGINT[],
 notes TEXT NOT NULL DEFAULT '',
 checked_by TEXT NOT NULL,
 checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reconciliation_status_idx
 ON integraciones_laboral.calendar_reconciliations(status);
CREATE TABLE IF NOT EXISTS integraciones_laboral.chatgpt_review_proposals (
 id BIGSERIAL PRIMARY KEY,
 integration_id BIGINT NOT NULL REFERENCES integraciones_laboral.integrations(id),
 event_id BIGINT REFERENCES integraciones_laboral.calendar_events(id),
 observed_on DATE NOT NULL,
 source_name TEXT NOT NULL,
 source_url TEXT NOT NULL DEFAULT '',
 detail TEXT NOT NULL,
 agreement TEXT NOT NULL DEFAULT '',
 pending TEXT NOT NULL DEFAULT '',
 responsible TEXT NOT NULL DEFAULT 'Por determinar',
 evidence_quote TEXT NOT NULL DEFAULT '',
 proposed_status TEXT NOT NULL DEFAULT '',
 source_kind TEXT NOT NULL DEFAULT 'ChatGPT',
 review_status TEXT NOT NULL DEFAULT 'Propuesto'
 CHECK (review_status IN ('Propuesto','Aprobado','Rechazado','Desactualizado')),
 fingerprint TEXT NOT NULL UNIQUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 approved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS chatgpt_proposals_review_idx
 ON integraciones_laboral.chatgpt_review_proposals(review_status,observed_on DESC);
CREATE INDEX IF NOT EXISTS chatgpt_proposals_integration_idx
 ON integraciones_laboral.chatgpt_review_proposals(integration_id,observed_on DESC);
CREATE TABLE IF NOT EXISTS integraciones_laboral.chatgpt_proposal_audit (
 id BIGSERIAL PRIMARY KEY,
 proposal_id BIGINT NOT NULL REFERENCES integraciones_laboral.chatgpt_review_proposals(id),
 decision TEXT NOT NULL CHECK (decision IN ('Aprobado','Rechazado')),
 reason TEXT NOT NULL DEFAULT '',
 actor_email TEXT NOT NULL,
 acted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(proposal_id,decision)
);
COMMIT;
