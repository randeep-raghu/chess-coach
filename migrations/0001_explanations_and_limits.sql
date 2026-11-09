CREATE TABLE explanations (
  cache_key TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  content_version TEXT NOT NULL
);

CREATE TABLE rate_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
