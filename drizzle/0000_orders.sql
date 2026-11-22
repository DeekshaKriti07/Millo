CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  checkout_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  receipt TEXT NOT NULL,
  created_at TEXT NOT NULL
);
