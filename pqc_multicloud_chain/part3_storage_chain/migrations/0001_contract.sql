-- migrations/0001_contract.sql
-- Schema Contract v1 (idempotent)

BEGIN;

-- 1) Schema version table (single row)
CREATE TABLE IF NOT EXISTS schema_version (
  version     INTEGER NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure exactly one row exists
INSERT INTO schema_version(version)
SELECT 0
WHERE NOT EXISTS (SELECT 1 FROM schema_version);

-- 2) tls_audit contract (you already created table; enforce columns exist)
-- Keep existing NOT NULL constraints (actor/action/ok) intact; we don't weaken security.
ALTER TABLE tls_audit
  ADD COLUMN IF NOT EXISTS session_id TEXT,
  ADD COLUMN IF NOT EXISTS client_identity TEXT,
  ADD COLUMN IF NOT EXISTS client_ip TEXT;

-- Ensure details exists with safe default
ALTER TABLE tls_audit
  ADD COLUMN IF NOT EXISTS details JSONB;

UPDATE tls_audit
SET details = '{}'::jsonb
WHERE details IS NULL;

-- 3) files contract (minimum fields used by pipeline)
-- NOTE: We only add columns if missing, never rename/drop here.
ALTER TABLE files
  ADD COLUMN IF NOT EXISTS merkle_root_sha3_512 BYTEA,
  ADD COLUMN IF NOT EXISTS transcript_hash_sha3_512 BYTEA,
  ADD COLUMN IF NOT EXISTS status TEXT;

-- 4) file_chunks contract (minimum fields used by encrypt/decrypt)
ALTER TABLE file_chunks
  ADD COLUMN IF NOT EXISTS nonce BYTEA,
  ADD COLUMN IF NOT EXISTS tag BYTEA,
  ADD COLUMN IF NOT EXISTS hash_sha3_512 BYTEA;

-- 5) Bump schema version to 1
UPDATE schema_version
SET version = 1, updated_at = now()
WHERE version < 1;

COMMIT;
