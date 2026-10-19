-- Live database upgrade for 2026-10-20: "Why not?" objections (fresh databases get this from schema.sql).
CREATE TABLE IF NOT EXISTS objections (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  target      TEXT NOT NULL,
  problem     TEXT NOT NULL,
  text        TEXT NOT NULL,
  text_key    TEXT NOT NULL,
  voter_hash  TEXT NOT NULL,
  ip_hash     TEXT NOT NULL,
  approved    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS objections_target_key ON objections (target, text_key);
CREATE INDEX IF NOT EXISTS objections_target ON objections (target, approved);
CREATE INDEX IF NOT EXISTS objections_ip ON objections (ip_hash, created_at);
