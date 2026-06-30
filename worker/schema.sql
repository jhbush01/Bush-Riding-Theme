-- Bush Riding Map — community route submissions.
CREATE TABLE IF NOT EXISTS submissions (
  id               TEXT PRIMARY KEY,
  status           TEXT NOT NULL DEFAULT 'pending',  -- pending | published | rejected
  name             TEXT NOT NULL,
  region           TEXT NOT NULL,
  country          TEXT DEFAULT 'Australia',
  difficulty       TEXT NOT NULL,                     -- easy | moderate | hard
  surface          TEXT,
  description      TEXT,
  distance_km      REAL,
  elevation_gain_m INTEGER,
  marker_lng       REAL,
  marker_lat       REAL,
  coords           TEXT,                              -- JSON [[lng,lat], ...] (downsampled)
  gpx_key          TEXT,                              -- R2 object key
  photo_key        TEXT,                              -- R2 object key (nullable)
  contributor      TEXT,
  email            TEXT,
  created_at       TEXT,
  reviewed_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_status ON submissions (status);
