// SQLite storage (Node's built-in driver, so there is nothing native to build).

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  pass_salt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  style TEXT NOT NULL,
  tier TEXT NOT NULL,
  colour TEXT NOT NULL,
  floors INTEGER NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  w INTEGER NOT NULL,
  h INTEGER NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  zone TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  land_cents INTEGER NOT NULL,
  build_cents INTEGER NOT NULL,
  value_cents INTEGER NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS donations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  charity TEXT NOT NULL,
  civic_id TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  donor_name TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  payload TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_ref TEXT,
  result TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_donations_charity ON donations(charity);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, kind);
`;

export function openDb(file = ':memory:') {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 4000;');
  db.exec(SCHEMA);
  // columns added after the first release
  const cols = new Set(db.prepare('PRAGMA table_info(properties)').all().map((c) => c.name));
  if (!cols.has('logo')) db.exec('ALTER TABLE properties ADD COLUMN logo BLOB');
  if (!cols.has('logo_v')) db.exec('ALTER TABLE properties ADD COLUMN logo_v INTEGER NOT NULL DEFAULT 0');
  return db;
}

// Run fn inside a transaction; rolls back if it throws.
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
