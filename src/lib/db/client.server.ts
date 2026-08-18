// SQLite persistence layer.
//
// Why SQLite: this project has no database provisioned anywhere (no
// DATABASE_URL, no Supabase project, nothing in the repo or in env). SQLite
// is a single file, needs zero external services, and is genuinely fine for
// an MVP's workload. If/when you outgrow it, the schema below is deliberately
// plain SQL — porting to Postgres is a schema translation, not a rewrite.
//
// DEPLOYMENT NOTE: this uses `better-sqlite3`, a native Node addon, and the
// storage layer (see storage.server.ts) writes to local disk. Both require a
// real Node.js process with a writable filesystem. The vite config in this
// repo defaults its Nitro build target to Cloudflare Workers, which supports
// neither native addons nor local disk. Either deploy this app to a Node
// host (Railway, Fly.io, Render, a VPS, Vercel Node functions, etc.) or, if
// Cloudflare is a hard requirement, swap this file for a D1 client and
// storage.server.ts for R2 — the rest of the app (server functions, UI)
// doesn't care which database/storage backend is behind these two files.

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.AUDIOTRACE_DATA_DIR || path.join(process.cwd(), "data");
mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "audiotrace.db");

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  dbInstance = db;
  return db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS recipients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      company TEXT,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY,
      original_filename TEXT NOT NULL,
      ext TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      duration_seconds REAL NOT NULL,
      sample_rate INTEGER NOT NULL,
      channels INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS protected_files (
      id TEXT PRIMARY KEY,
      upload_id TEXT NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
      recipient_id TEXT NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
      fingerprint_hex TEXT NOT NULL UNIQUE,
      ext TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_protected_files_fingerprint ON protected_files(fingerprint_hex);
    CREATE INDEX IF NOT EXISTS idx_protected_files_upload ON protected_files(upload_id);
    CREATE INDEX IF NOT EXISTS idx_protected_files_recipient ON protected_files(recipient_id);

    CREATE TABLE IF NOT EXISTS trace_scans (
      id TEXT PRIMARY KEY,
      suspect_filename TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      detected INTEGER NOT NULL,
      crc_valid INTEGER NOT NULL,
      confidence REAL NOT NULL,
      decoded_fingerprint TEXT,
      matched_protected_file_id TEXT REFERENCES protected_files(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_trace_scans_matched ON trace_scans(matched_protected_file_id);

    -- Correlates a checkout the customer initiated with the (later, async)
    -- webhook confirmation that it was actually paid. See
    -- src/lib/payments/ for the full flow. "id" here is OUR OWN generated
    -- checkout_ref, not any Dodo-assigned id.
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      plan TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      email TEXT,
      dodo_session_id TEXT,
      dodo_subscription_id TEXT,
      dodo_payment_id TEXT,
      raw_event_type TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
    CREATE INDEX IF NOT EXISTS idx_payments_email ON payments(email);

    -- Real user accounts (email + password). Separate from "payments" on
    -- purpose: whether someone has an account and whether they have an
    -- active subscription are two different questions, checked
    -- independently by the dashboard access gate.
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `);
}

export { DATA_DIR };
