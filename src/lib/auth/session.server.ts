// Signed session cookie proving "who is this browser logged in as" —
// separate and distinct from payment status. A visitor can be logged in
// with no active subscription (sees /payment-required with a subscribe
// button) or have an active subscription but not be logged in on this
// browser (sees /login). Both checks happen independently in
// src/lib/auth/routes.server.ts.

import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "audiotrace_session";
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Missing required environment variable: SESSION_SECRET");
  return secret;
}

function base64url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBuffer(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

export type SessionPayload = {
  userId: string;
  email: string;
  exp: number;
};

function sign(payloadB64: string): string {
  return base64url(createHmac("sha256", getSecret()).update(payloadB64).digest());
}

export function issueSessionToken(userId: string, email: string): string {
  const payload: SessionPayload = { userId, email, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS };
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  const expectedSig = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(base64urlToBuffer(payloadB64).toString("utf8")) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function buildSessionCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_SECONDS}${secure}`;
}

export function buildClearSessionCookieHeader(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export { COOKIE_NAME as SESSION_COOKIE_NAME };
