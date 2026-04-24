CREATE TABLE IF NOT EXISTS files (
  file_id              UUID PRIMARY KEY,
  filename             TEXT NOT NULL,
  file_size            BIGINT NOT NULL,
  chunk_size           INTEGER NOT NULL,
  chunks_total         INTEGER NOT NULL,
  salt                 BYTEA NOT NULL,
  merkle_root_sha3_512 BYTEA NOT NULL,
  final_hash_sha3_512  BYTEA NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chunks (
  file_id              UUID REFERENCES files(file_id) ON DELETE CASCADE,
  chunk_index          INTEGER NOT NULL,
  nonce                BYTEA NOT NULL,
  ciphertext_len       INTEGER NOT NULL,
  chunk_hash_sha3_512  BYTEA NOT NULL,
  PRIMARY KEY (file_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS replicas (
  file_id      UUID REFERENCES files(file_id) ON DELETE CASCADE,
  cloud_name   TEXT NOT NULL,
  status       TEXT NOT NULL,
  last_checked TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (file_id, cloud_name)
);

