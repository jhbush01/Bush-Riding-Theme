-- Bush Riding Map — personal ride diary.
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  username      TEXT,                   -- public display name; unique (NOCASE)
  password_hash TEXT NOT NULL,          -- PBKDF2:  saltB64:hashB64
  created_at    TEXT
);
-- Case-insensitive unique username. NULLs are allowed and distinct in SQLite,
-- so accounts created before usernames existed stay valid until they set one.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (username COLLATE NOCASE);

-- Community route reviews (public). One row per (route_id, user_id) — a rider's
-- single, editable review. rating 1..5; optional comment + one photo (R2).
CREATE TABLE IF NOT EXISTS reviews (
  id         TEXT PRIMARY KEY,
  route_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  rating     INTEGER NOT NULL,
  comment    TEXT,
  photo_key  TEXT,                      -- R2 key under reviews/ (served publicly)
  created_at TEXT,
  updated_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_route_user ON reviews (route_id, user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_route ON reviews (route_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rides (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL,
  title              TEXT,
  recorded_at        TEXT,
  distance_km        REAL,
  elevation_m        INTEGER,
  geojson            TEXT,              -- LineString geometry JSON
  photo_key          TEXT,
  note               TEXT,
  weather            TEXT,              -- sunny | overcast | wet
  surface            TEXT,              -- smooth | rough | muddy
  vibe               TEXT,              -- suffered | cruised | flew
  companions         TEXT,
  community_route_id TEXT,
  is_manual          INTEGER DEFAULT 0,
  country            TEXT,
  region             TEXT,
  created_at         TEXT
);

CREATE INDEX IF NOT EXISTS idx_rides_user ON rides (user_id);
CREATE INDEX IF NOT EXISTS idx_rides_user_date ON rides (user_id, recorded_at DESC);
