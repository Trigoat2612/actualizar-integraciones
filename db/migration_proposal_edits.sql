-- Historial de edición de propuestas. Migración aditiva e idempotente.
-- No cambia las bitácoras publicadas ni los registros de aprobación.
CREATE TABLE IF NOT EXISTS integraciones_laboral.chatgpt_proposal_edit_audit (
  id BIGSERIAL PRIMARY KEY,
  proposal_id BIGINT NOT NULL REFERENCES integraciones_laboral.chatgpt_review_proposals(id),
  before_data JSONB NOT NULL,
  after_data JSONB NOT NULL,
  actor_email TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chatgpt_proposal_edit_audit_proposal_idx
 ON integraciones_laboral.chatgpt_proposal_edit_audit(proposal_id,edited_at DESC);
