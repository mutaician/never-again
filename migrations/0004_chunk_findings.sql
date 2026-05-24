CREATE TABLE IF NOT EXISTS chunk_findings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  chunk_id TEXT NOT NULL,
  import_id TEXT NOT NULL,
  category TEXT NOT NULL,
  finding_json TEXT NOT NULL,
  confidence REAL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (chunk_id) REFERENCES chunks(id),
  FOREIGN KEY (import_id) REFERENCES imports(id)
);

CREATE INDEX IF NOT EXISTS idx_chunk_findings_user_id ON chunk_findings(user_id);
CREATE INDEX IF NOT EXISTS idx_chunk_findings_chunk_id ON chunk_findings(chunk_id);
CREATE INDEX IF NOT EXISTS idx_chunk_findings_import_id ON chunk_findings(import_id);
