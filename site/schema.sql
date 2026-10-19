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
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ideas_problem ON ideas (problem, approved);
CREATE INDEX IF NOT EXISTS ideas_ip ON ideas (ip_hash, created_at);

-- "Me too" on a voice and "I back this" on an idea. One per person per item.
CREATE TABLE IF NOT EXISTS backs (
  kind        TEXT NOT NULL,          -- 'voice' | 'idea'
  item_id     INTEGER NOT NULL,
  voter_hash  TEXT NOT NULL,
  ip_hash     TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (kind, item_id, voter_hash)
);
CREATE INDEX IF NOT EXISTS backs_ip ON backs (ip_hash, created_at);
