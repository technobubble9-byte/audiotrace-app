// Lightweight signed-cookie access gate. This is deliberately NOT a full
// account system: no passwords, no sessions table, no login flow. A
// customer who completes a real, webhook-verified Dodo payment gets an
// httpOnly cookie granting dashboard access for a while. That's it.
//
// This is a real, honest security boundary (HMAC-signed, server-verified,
// can't be forged without ACCESS_TOKEN_SECRET) — it's just a much smaller
// one than a proper multi-tenant auth system. Known gaps, worth knowing
// about before you scale past "it's just me testing this":
//   - No way to revoke a single customer's access early (short of rotating
//     the whole secret, which logs everyone out)
//   - No recovery flow if a customer clears cookies / switches devices —
//     they'd need to go through checkout again (blocked by Dodo since
//     they already have an active subscription) or you grant access
//     manually
//   - Single shared workspace: every paying customer sees the same
//     uploads/recipients/protected files. Fine for one customer, wrong for
//     several paying customers who shouldn't see each other's data.

import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "audiotrace_access";
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days — matches "subscription", not "session"

function getSecret(): string {
  const secret = process.env.ACCESS_TOKEN_SECRET;
  if (!secret) throw new Error("Missing required environment variable: ACCESS_TOKEN_SECRET");
  return secret;
}

function base64url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBuffer(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

export type AccessTokenPayload = {
  email: string;
  plan: string;
  exp: number; // unix seconds
};

function sign(payloadB64: string): string {
  return base64url(createHmac("sha256", getSecret()).update(payloadB64).digest());
}

export function issueAccessToken(email: string, plan: string, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  const payload: AccessTokenPayload = { email, plan, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = sign(payloadB64);
  return `${payloadB64}.${sig}`;
}

export function verifyAccessToken(token: string | undefined | null): AccessTokenPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  const expectedSig = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(base64urlToBuffer(payloadB64).toString("utf8")) as AccessTokenPayload;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function readAccessTokenFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [k, ...rest] = part.trim().split("=");
    if (k === COOKIE_NAME) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function buildAccessCookieHeader(token: string, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttlSeconds}${secure}`;
}

export { COOKIE_NAME };
