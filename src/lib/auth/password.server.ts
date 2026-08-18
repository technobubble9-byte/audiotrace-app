// Password hashing via Node's built-in `crypto.scrypt` — deliberately no
// bcrypt/argon2 dependency. Those are native addons and this project
// already hit real friction getting one native addon (better-sqlite3) to
// install on Windows; scrypt is a solid, standard choice built into Node
// with zero extra install risk.

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const candidate = scryptSync(password, salt, KEY_LENGTH);
  const stored = Buffer.from(hash, "hex");
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}
