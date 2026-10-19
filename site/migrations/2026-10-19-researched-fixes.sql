-- Live database upgrade for 2026-10-19 (fresh databases get all of this from schema.sql).
ALTER TABLE ideas ADD COLUMN detail TEXT;
CREATE TABLE IF NOT EXISTS ai_checks (who TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ai_checks_who ON ai_checks (who, created_at);
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ip_hash TEXT NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS feedback_ip ON feedback (ip_hash, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS voices_problem_key ON voices (problem, text_key);
CREATE UNIQUE INDEX IF NOT EXISTS ideas_problem_key ON ideas (problem, title_key);
