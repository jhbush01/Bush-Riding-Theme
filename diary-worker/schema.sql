-- Bush Riding Map — personal ride diary.
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,          -- PBKDF2:  saltB64:hashB64
  created_at    TEXT
);

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
