import { getDb } from "./client.server";

export type Recipient = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  notes: string | null;
  created_at: string;
};

export type UploadRow = {
  id: string;
  original_filename: string;
  ext: string;
  size_bytes: number;
  duration_seconds: number;
  sample_rate: number;
  channels: number;
  storage_path: string;
  sha256: string;
  created_at: string;
};

export type ProtectedFileRow = {
  id: string;
  upload_id: string;
  recipient_id: string;
  fingerprint_hex: string;
  ext: string;
  size_bytes: number;
  storage_path: string;
  created_at: string;
};

export type ProtectedFileWithJoins = ProtectedFileRow & {
  recipient_name: string;
  recipient_email: string;
  upload_filename: string;
};

export type TraceScanRow = {
  id: string;
  suspect_filename: string;
  storage_path: string;
  detected: number;
  crc_valid: number;
  confidence: number;
  decoded_fingerprint: string | null;
  matched_protected_file_id: string | null;
  created_at: string;
};

export type TraceScanWithJoins = TraceScanRow & {
  matched_recipient_name: string | null;
  matched_recipient_email: string | null;
  matched_upload_filename: string | null;
};

// ---------------- Recipients ----------------

export function insertRecipient(r: Recipient) {
  getDb()
    .prepare(
      `INSERT INTO recipients (id, name, email, company, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(r.id, r.name, r.email, r.company, r.notes, r.created_at);
}

export function listRecipients(): Recipient[] {
  return getDb().prepare(`SELECT * FROM recipients ORDER BY created_at DESC`).all() as Recipient[];
}

export function getRecipient(id: string): Recipient | undefined {
  return getDb().prepare(`SELECT * FROM recipients WHERE id = ?`).get(id) as Recipient | undefined;
}

// ---------------- Uploads ----------------

export function insertUpload(u: UploadRow) {
  getDb()
    .prepare(
      `INSERT INTO uploads (id, original_filename, ext, size_bytes, duration_seconds, sample_rate, channels, storage_path, sha256, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      u.id,
      u.original_filename,
      u.ext,
      u.size_bytes,
      u.duration_seconds,
      u.sample_rate,
      u.channels,
      u.storage_path,
      u.sha256,
      u.created_at,
    );
}

export function listUploads(): UploadRow[] {
  return getDb().prepare(`SELECT * FROM uploads ORDER BY created_at DESC`).all() as UploadRow[];
}

export function getUpload(id: string): UploadRow | undefined {
  return getDb().prepare(`SELECT * FROM uploads WHERE id = ?`).get(id) as UploadRow | undefined;
}

// ---------------- Protected files ----------------

export function insertProtectedFile(p: ProtectedFileRow) {
  getDb()
    .prepare(
      `INSERT INTO protected_files (id, upload_id, recipient_id, fingerprint_hex, ext, size_bytes, storage_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      p.id,
      p.upload_id,
      p.recipient_id,
      p.fingerprint_hex,
      p.ext,
      p.size_bytes,
      p.storage_path,
      p.created_at,
    );
}

export function listProtectedFiles(): ProtectedFileWithJoins[] {
  return getDb()
    .prepare(
      `SELECT pf.*, r.name as recipient_name, r.email as recipient_email, u.original_filename as upload_filename
       FROM protected_files pf
       JOIN recipients r ON r.id = pf.recipient_id
       JOIN uploads u ON u.id = pf.upload_id
       ORDER BY pf.created_at DESC`,
    )
    .all() as ProtectedFileWithJoins[];
}

export function getProtectedFile(id: string): ProtectedFileRow | undefined {
  return getDb().prepare(`SELECT * FROM protected_files WHERE id = ?`).get(id) as
    | ProtectedFileRow
    | undefined;
}

export function getProtectedFileWithJoins(id: string): ProtectedFileWithJoins | undefined {
  return getDb()
    .prepare(
      `SELECT pf.*, r.name as recipient_name, r.email as recipient_email, u.original_filename as upload_filename
       FROM protected_files pf
       JOIN recipients r ON r.id = pf.recipient_id
       JOIN uploads u ON u.id = pf.upload_id
       WHERE pf.id = ?`,
    )
    .get(id) as ProtectedFileWithJoins | undefined;
}

export function getProtectedFileByFingerprint(fingerprintHex: string): ProtectedFileWithJoins | undefined {
  return getDb()
    .prepare(
      `SELECT pf.*, r.name as recipient_name, r.email as recipient_email, u.original_filename as upload_filename
       FROM protected_files pf
       JOIN recipients r ON r.id = pf.recipient_id
       JOIN uploads u ON u.id = pf.upload_id
       WHERE pf.fingerprint_hex = ?`,
    )
    .get(fingerprintHex) as ProtectedFileWithJoins | undefined;
}

// ---------------- Trace scans ----------------

export function insertTraceScan(s: TraceScanRow) {
  getDb()
    .prepare(
      `INSERT INTO trace_scans (id, suspect_filename, storage_path, detected, crc_valid, confidence, decoded_fingerprint, matched_protected_file_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      s.id,
      s.suspect_filename,
      s.storage_path,
      s.detected,
      s.crc_valid,
      s.confidence,
      s.decoded_fingerprint,
      s.matched_protected_file_id,
      s.created_at,
    );
}

export function listTraceScans(): TraceScanWithJoins[] {
  return getDb()
    .prepare(
      `SELECT ts.*,
              r.name as matched_recipient_name,
              r.email as matched_recipient_email,
              u.original_filename as matched_upload_filename
       FROM trace_scans ts
       LEFT JOIN protected_files pf ON pf.id = ts.matched_protected_file_id
       LEFT JOIN recipients r ON r.id = pf.recipient_id
       LEFT JOIN uploads u ON u.id = pf.upload_id
       ORDER BY ts.created_at DESC`,
    )
    .all() as TraceScanWithJoins[];
}

// ---------------- Payments (checkout <-> webhook correlation) ----------------

export type PaymentRow = {
  id: string;
  plan: string;
  status: "pending" | "active" | "failed";
  email: string | null;
  dodo_session_id: string | null;
  dodo_subscription_id: string | null;
  dodo_payment_id: string | null;
  raw_event_type: string | null;
  created_at: string;
  updated_at: string;
};

export function insertPendingPayment(id: string, plan: string) {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO payments (id, plan, status, created_at, updated_at) VALUES (?, ?, 'pending', ?, ?)`,
    )
    .run(id, plan, now, now);
}

export function getPayment(id: string): PaymentRow | undefined {
  return getDb().prepare(`SELECT * FROM payments WHERE id = ?`).get(id) as PaymentRow | undefined;
}

export function markPaymentActive(
  id: string,
  fields: { email: string; dodoSubscriptionId?: string; dodoPaymentId?: string; rawEventType: string },
) {
  getDb()
    .prepare(
      `UPDATE payments SET status = 'active', email = ?, dodo_subscription_id = COALESCE(?, dodo_subscription_id),
       dodo_payment_id = COALESCE(?, dodo_payment_id), raw_event_type = ?, updated_at = ? WHERE id = ?`,
    )
    .run(
      fields.email,
      fields.dodoSubscriptionId ?? null,
      fields.dodoPaymentId ?? null,
      fields.rawEventType,
      new Date().toISOString(),
      id,
    );
}

export function markPaymentFailed(id: string, rawEventType: string) {
  getDb()
    .prepare(`UPDATE payments SET status = 'failed', raw_event_type = ?, updated_at = ? WHERE id = ?`)
    .run(rawEventType, new Date().toISOString(), id);
}

/** Used when a webhook arrives before we can match it to a checkout_ref
 * (e.g. metadata missing/mangled) — fall back to matching by Dodo's own
 * subscription/payment id if we've seen it before, otherwise this event
 * simply can't be correlated and is logged for manual reconciliation. */
export function findPaymentByDodoId(dodoId: string): PaymentRow | undefined {
  return getDb()
    .prepare(
      `SELECT * FROM payments WHERE dodo_subscription_id = ? OR dodo_payment_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(dodoId, dodoId) as PaymentRow | undefined;
}

/** Does this email have any payment row currently marked active? Used by
 * the dashboard gate — kept simple (no separate "subscriptions" concept)
 * on purpose for the current single-workspace version of this app. */
export function hasActivePaymentForEmail(email: string): boolean {
  const row = getDb()
    .prepare(`SELECT 1 FROM payments WHERE email = ? AND status = 'active' LIMIT 1`)
    .get(email);
  return !!row;
}

// ---------------- Users ----------------

export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  created_at: string;
};

export function insertUser(user: UserRow) {
  getDb()
    .prepare(
      `INSERT INTO users (id, email, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(user.id, user.email, user.password_hash, user.password_salt, user.created_at);
}

export function getUserByEmail(email: string): UserRow | undefined {
  return getDb().prepare(`SELECT * FROM users WHERE email = ?`).get(email.toLowerCase()) as
    | UserRow
    | undefined;
}

export function getUserById(id: string): UserRow | undefined {
  return getDb().prepare(`SELECT * FROM users WHERE id = ?`).get(id) as UserRow | undefined;
}
