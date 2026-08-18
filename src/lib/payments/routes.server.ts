// Raw HTTP handlers for the payment flow. These deliberately do NOT go
// through TanStack Start's createServerFn/CSRF machinery:
//   - POST /api/checkout is called from our own logged-in dashboard (and,
//     for now, still reachable cross-origin from the marketing site for
//     the pricing-card buttons — CORS-gated to MARKETING_SITE_ORIGINS).
//   - POST /api/webhooks/dodo is called server-to-server by Dodo, not a
//     browser — CSRF (a browser-credential-forgery defense) doesn't apply.
//     Its security is the Standard Webhooks signature check.
//   - GET /api/checkout/callback is a plain browser redirect target.
//
// ACCESS MODEL (two independent checks, both required for /dashboard):
//   1. Is there a valid session cookie? (are you logged in — see
//      src/lib/auth/routes.server.ts) If not -> /login.
//   2. Does the logged-in account's email have an active payment? If not
//      -> /payment-required, which offers to start checkout for the
//      logged-in account.
//
// See README.md for the env vars this needs and the Dodo dashboard setup.

import { randomUUID } from "node:crypto";

import { createCheckoutSession, unwrapWebhook, type PlanKey } from "./dodo.server";
import { getSessionUser } from "../auth/routes.server";
import {
  insertPendingPayment,
  getPayment,
  markPaymentActive,
  markPaymentFailed,
  findPaymentByDodoId,
  hasActivePaymentForEmail,
} from "../db/queries.server";

function getAppBaseUrl(): string {
  return process.env.PUBLIC_APP_URL || "http://localhost:8080";
}

function getAllowedMarketingOrigins(): string[] {
  const raw = process.env.MARKETING_SITE_ORIGINS || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  const allowed = getAllowedMarketingOrigins();
  if (origin && allowed.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Credentials": "true",
      Vary: "Origin",
    };
  }
  return {};
}

async function handleCreateCheckout(request: Request): Promise<Response> {
  const cors = corsHeaders(request);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: cors });
  }

  // Checkout now requires a logged-in account — this is what ties the
  // eventual webhook confirmation back to a specific user without any
  // guesswork. If you're not logged in yet, sign up/log in first.
  const sessionUser = getSessionUser(request);
  if (!sessionUser) {
    return Response.json(
      { error: "not_authenticated", message: "Log in or create an account before starting checkout." },
      { status: 401, headers: cors },
    );
  }

  let body: { plan?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: cors });
  }

  const plan = (body.plan || "").toUpperCase();
  if (plan !== "STANDARD" && plan !== "ULTIMATE") {
    return Response.json({ error: "plan must be STANDARD or ULTIMATE" }, { status: 422, headers: cors });
  }

  const checkoutRef = randomUUID();
  insertPendingPayment(checkoutRef, plan);

  try {
    const { checkoutUrl } = await createCheckoutSession({
      plan: plan as PlanKey,
      checkoutRef,
      appBaseUrl: getAppBaseUrl(),
      customerEmail: sessionUser.email,
    });
    return Response.json({ checkoutUrl }, { headers: cors });
  } catch (error) {
    console.error("Failed to create Dodo checkout session:", error);
    markPaymentFailed(checkoutRef, "checkout_creation_error");
    return Response.json({ error: "Failed to create checkout session" }, { status: 500, headers: cors });
  }
}

async function handleWebhook(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const rawBody = await request.text();

  let event;
  try {
    event = unwrapWebhook(rawBody, request.headers);
  } catch (error) {
    console.error("Dodo webhook signature verification failed:", error);
    return new Response("Invalid signature", { status: 401 });
  }

  const data = event.data as Record<string, unknown>;
  const metadata = (data.metadata as Record<string, unknown>) || {};
  const checkoutRef = typeof metadata.audiotrace_checkout_ref === "string" ? metadata.audiotrace_checkout_ref : null;

  const customer = data.customer as { email?: string } | undefined;
  const email = customer?.email ?? (typeof data.email === "string" ? data.email : undefined);
  const subscriptionId = typeof data.subscription_id === "string" ? data.subscription_id : undefined;
  const paymentId = typeof data.payment_id === "string" ? data.payment_id : (typeof data.id === "string" ? data.id : undefined);

  const successEvents = new Set(["payment.succeeded", "subscription.active", "subscription.renewed"]);
  const failureEvents = new Set(["payment.failed", "payment.cancelled", "subscription.failed", "subscription.cancelled", "subscription.expired"]);

  let payment = checkoutRef ? getPayment(checkoutRef) : undefined;
  if (!payment && (subscriptionId || paymentId)) {
    payment = findPaymentByDodoId(subscriptionId || paymentId || "");
  }

  if (!payment) {
    console.warn("Dodo webhook: no matching payment record for event", event.type, { checkoutRef, subscriptionId, paymentId });
    return Response.json({ received: true, matched: false });
  }

  if (successEvents.has(event.type) && email) {
    markPaymentActive(payment.id, {
      email,
      dodoSubscriptionId: subscriptionId,
      dodoPaymentId: paymentId,
      rawEventType: event.type,
    });
  } else if (failureEvents.has(event.type)) {
    markPaymentFailed(payment.id, event.type);
  }

  return Response.json({ received: true, matched: true });
}

async function handleCheckoutCallback(request: Request, url: URL): Promise<Response> {
  const ref = url.searchParams.get("ref");
  const appBaseUrl = getAppBaseUrl();
  if (!ref) {
    return Response.redirect(`${appBaseUrl}/payment-required?error=missing_ref`, 302);
  }

  // Identity already comes from the session cookie (they had to be logged
  // in to start checkout) — this loop just waits for the webhook to mark
  // the payment active, then sends them to /dashboard where the gate will
  // find it.
  const maxAttempts = 10;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const payment = getPayment(ref);
    if (payment?.status === "active") {
      return Response.redirect(`${appBaseUrl}/dashboard`, 302);
    }
    if (payment?.status === "failed") {
      return Response.redirect(`${appBaseUrl}/payment-required?ref=${ref}&status=failed`, 302);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  return Response.redirect(`${appBaseUrl}/payment-required?ref=${ref}&status=pending`, 302);
}

export async function handlePaymentStatusCheck(url: URL): Promise<Response> {
  const ref = url.searchParams.get("ref");
  if (!ref) return Response.json({ status: "unknown" });
  const payment = getPayment(ref);
  return Response.json({ status: payment?.status ?? "unknown" });
}

/**
 * Entry point called from src/server.ts for every request. Returns a
 * Response if this path is a payment-related route or a gated dashboard
 * path, or null to let the normal app router handle it.
 */
export async function handlePaymentRoute(request: Request, url: URL): Promise<Response | null> {
  if (url.pathname === "/api/checkout") {
    return handleCreateCheckout(request);
  }
  if (url.pathname === "/api/checkout/callback" && request.method === "GET") {
    return handleCheckoutCallback(request, url);
  }
  if (url.pathname === "/api/checkout/status" && request.method === "GET") {
    return handlePaymentStatusCheck(url);
  }
  if (url.pathname === "/api/webhooks/dodo") {
    return handleWebhook(request);
  }
  if (url.pathname === "/dashboard" || url.pathname.startsWith("/dashboard/")) {
    const appBaseUrl = getAppBaseUrl();
    const sessionUser = getSessionUser(request);
    if (!sessionUser) {
      return Response.redirect(`${appBaseUrl}/login`, 302);
    }
    if (!hasActivePaymentForEmail(sessionUser.email)) {
      return Response.redirect(`${appBaseUrl}/payment-required`, 302);
    }
  }
  return null;
}
