CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  import_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  turn_start INTEGER,
  turn_end INTEGER,
  content_hash TEXT NOT NULL,
  content_r2_key TEXT NOT NULL,
  char_count INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (import_id) REFERENCES imports(id)
);

CREATE INDEX IF NOT EXISTS idx_chunks_user_id ON chunks(user_id);
CREATE INDEX IF NOT EXISTS idx_chunks_import_id ON chunks(import_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chunks_import_index ON chunks(import_id, chunk_index);
