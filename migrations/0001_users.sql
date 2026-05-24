CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  auth0_sub TEXT NOT NULL UNIQUE,
  email TEXT,
  name TEXT,
  backboard_assistant_id TEXT,
  assistant_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_auth0_sub ON users(auth0_sub);
