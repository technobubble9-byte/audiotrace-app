// Simple email+password auth. Raw HTTP handlers (same reasoning as
// src/lib/payments/routes.server.ts — direct control over Set-Cookie
// headers), wired into src/server.ts.

import { randomUUID } from "node:crypto";

import { hashPassword, verifyPassword } from "./password.server";
import {
  issueSessionToken,
  verifySessionToken,
  readCookie,
  buildSessionCookieHeader,
  buildClearSessionCookieHeader,
  SESSION_COOKIE_NAME,
} from "./session.server";
import { insertUser, getUserByEmail, getUserById, type UserRow } from "../db/queries.server";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function handleSignup(request: Request): Promise<Response> {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";

  if (!isValidEmail(email)) {
    return Response.json({ error: "Enter a valid email address." }, { status: 422 });
  }
  if (password.length < 8) {
    return Response.json({ error: "Password must be at least 8 characters." }, { status: 422 });
  }
  if (getUserByEmail(email)) {
    return Response.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const { hash, salt } = hashPassword(password);
  const user: UserRow = {
    id: randomUUID(),
    email,
    password_hash: hash,
    password_salt: salt,
    created_at: new Date().toISOString(),
  };
  insertUser(user);

  const token = issueSessionToken(user.id, user.email);
  return Response.json(
    { ok: true, email: user.email },
    { headers: { "Set-Cookie": buildSessionCookieHeader(token) } },
  );
}

async function handleLogin(request: Request): Promise<Response> {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";

  const user = getUserByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash, user.password_salt)) {
    // Deliberately identical error for "no such user" and "wrong password"
    // so this endpoint can't be used to enumerate registered emails.
    return Response.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  const token = issueSessionToken(user.id, user.email);
  return Response.json(
    { ok: true, email: user.email },
    { headers: { "Set-Cookie": buildSessionCookieHeader(token) } },
  );
}

async function handleLogout(): Promise<Response> {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": buildClearSessionCookieHeader() } });
}

async function handleMe(request: Request): Promise<Response> {
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE_NAME);
  const session = verifySessionToken(token);
  if (!session) return Response.json({ loggedIn: false });
  const user = getUserById(session.userId);
  if (!user) return Response.json({ loggedIn: false });
  return Response.json({ loggedIn: true, email: user.email });
}

export async function handleAuthRoute(request: Request, url: URL): Promise<Response | null> {
  if (url.pathname === "/api/auth/signup" && request.method === "POST") return handleSignup(request);
  if (url.pathname === "/api/auth/login" && request.method === "POST") return handleLogin(request);
  if (url.pathname === "/api/auth/logout" && request.method === "POST") return handleLogout();
  if (url.pathname === "/api/auth/me" && request.method === "GET") return handleMe(request);
  return null;
}

/** Used by the dashboard gate (payments/routes.server.ts) to resolve the
 * logged-in user from the request, if any. */
export function getSessionUser(request: Request): { userId: string; email: string } | null {
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE_NAME);
  const session = verifySessionToken(token);
  if (!session) return null;
  const user = getUserById(session.userId);
  if (!user) return null;
  return { userId: user.id, email: user.email };
}
