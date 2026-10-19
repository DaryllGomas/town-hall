-- What people are struggling with. Shown once the AI screen passes it (approved = 1).
CREATE TABLE IF NOT EXISTS voices (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  problem     TEXT NOT NULL,          -- slug from public/problems.json, or 'other'
  text        TEXT NOT NULL,
  text_key    TEXT NOT NULL,          -- lowercased, for dropping copy-paste floods
  voter_hash  TEXT NOT NULL,          -- sha256(salt + cookie id); 'seed' for chat captures
  ip_hash     TEXT NOT NULL,          -- sha256(salt + day + ip); rotates daily, rate limits only
  source      TEXT NOT NULL,          -- 'person' | 'chat'
  approved    INTEGER NOT NULL DEFAULT 0, -- 1 shown, 0 waiting for review, -1 rejected
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS voices_problem ON voices (problem, approved);
CREATE UNIQUE INDEX IF NOT EXISTS voices_problem_key ON voices (problem, text_key);
CREATE INDEX IF NOT EXISTS voices_ip ON voices (ip_hash, created_at);

-- What people believe should happen: fixes from people and AI drafts.
CREATE TABLE IF NOT EXISTS ideas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  problem     TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  title_key   TEXT NOT NULL,
  voter_hash  TEXT NOT NULL,          -- 'ai' for AI drafts
  ip_hash     TEXT NOT NULL,
  source      TEXT NOT NULL,          -- 'person' | 'ai' | 'repo'
  approved    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  detail      TEXT                    -- researched fixes: JSON {type, scale, who, sources, url}
);
CREATE INDEX IF NOT EXISTS ideas_problem ON ideas (problem, approved);
CREATE UNIQUE INDEX IF NOT EXISTS ideas_problem_key ON ideas (problem, title_key);
CREATE INDEX IF NOT EXISTS ideas_ip ON ideas (ip_hash, created_at);

-- "Why not?": why someone disagrees with a fix or an issue's plan. Shown once the AI screen passes it (approved = 1).
CREATE TABLE IF NOT EXISTS objections (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  target      TEXT NOT NULL,          -- 'idea:<id>' or 'plan:<problem slug>'
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

-- "Me too" on a voice, "I back this" on an idea and "Agree" on an objection. One per person per item.
CREATE TABLE IF NOT EXISTS backs (
  kind        TEXT NOT NULL,          -- 'voice' | 'idea' | 'objection'
  item_id     INTEGER NOT NULL,
  voter_hash  TEXT NOT NULL,
  ip_hash     TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (kind, item_id, voter_hash)
);
CREATE INDEX IF NOT EXISTS backs_ip ON backs (ip_hash, created_at);

-- One row per AI screen of a new post, keyed by voter hash and by daily IP hash, to cap Workers AI calls per day.
CREATE TABLE IF NOT EXISTS ai_checks (
  who         TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_checks_who ON ai_checks (who, created_at);

-- "Make it better": open feedback on the site. Not shown on the page; read in the weekly review.
CREATE TABLE IF NOT EXISTS feedback (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash     TEXT NOT NULL,
  text        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS feedback_ip ON feedback (ip_hash, created_at);
