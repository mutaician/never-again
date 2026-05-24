CREATE TABLE IF NOT EXISTS preflights (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_idea TEXT NOT NULL,
  retrieved_memory_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_preflights_user_id ON preflights(user_id);
CREATE INDEX IF NOT EXISTS idx_preflights_created_at ON preflights(created_at);
