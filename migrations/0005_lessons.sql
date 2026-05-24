CREATE TABLE IF NOT EXISTS lessons (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  import_id TEXT,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  problem_pattern TEXT NOT NULL,
  evidence TEXT NOT NULL,
  future_rule TEXT NOT NULL,
  confidence REAL NOT NULL,
  status TEXT NOT NULL,
  backboard_memory_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (import_id) REFERENCES imports(id)
);

CREATE INDEX IF NOT EXISTS idx_lessons_user_id ON lessons(user_id);
CREATE INDEX IF NOT EXISTS idx_lessons_project_id ON lessons(project_id);
CREATE INDEX IF NOT EXISTS idx_lessons_import_id ON lessons(import_id);
CREATE INDEX IF NOT EXISTS idx_lessons_status ON lessons(status);
