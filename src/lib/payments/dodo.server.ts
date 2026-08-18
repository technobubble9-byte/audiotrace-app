// Thin wrapper around the official `dodopayments` SDK. Keeps the API key
// and product-ID-to-plan mapping in one place.
//
// Env vars required (see .env.example):
//   DODO_PAYMENTS_API_KEY       - secret key, server-only, never logged
//   DODO_PAYMENTS_WEBHOOK_SECRET - from Dodo dashboard → Developer → Webhooks
//   DODO_ENVIRONMENT            - "test_mode" or "live_mode"
//   DODO_PRODUCT_ID_BASIC       - product id for the Basic tier
//   DODO_PRODUCT_ID_PRO         - product id for the Pro tier
//   DODO_PRODUCT_ID_ELITE       - product id for the Elite tier

import DodoPayments from "dodopayments";

export type PlanKey = "BASIC" | "PRO" | "ELITE";

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

let client: DodoPayments | null = null;
function getClient(): DodoPayments {
  if (client) return client;
  client = new DodoPayments({
    bearerToken: getEnv("DODO_PAYMENTS_API_KEY"),
    webhookKey: getEnv("DODO_PAYMENTS_WEBHOOK_SECRET"),
    environment: (process.env.DODO_ENVIRONMENT as "test_mode" | "live_mode") || "test_mode",
  });
  return client;
}

function productIdForPlan(plan: PlanKey): string {
  if (plan === "BASIC") return getEnv("DODO_PRODUCT_ID_BASIC");
  if (plan === "PRO") return getEnv("DODO_PRODUCT_ID_PRO");
  if (plan === "ELITE") return getEnv("DODO_PRODUCT_ID_ELITE");
  throw new Error(`Unknown plan: ${plan}`);
}

/**
 * Creates a hosted Dodo checkout session for the given plan.
 * `checkoutRef` is OUR OWN correlation id (not Dodo's) — it's threaded
 * through as metadata and as a query param on the return_url, so that when
 * the browser gets redirected back, we can look up the corresponding
 * `payments` row without depending on exactly which fields Dodo appends to
 * the return_url (undocumented/subject to change) — the webhook is the
 * actual source of truth; this ref is just how we correlate it to a browser.
 */
export async function createCheckoutSession(params: {
  plan: PlanKey;
  checkoutRef: string;
  appBaseUrl: string;
  customerEmail?: string;
}): Promise<{ checkoutUrl: string; sessionId: string }> {
  const dodo = getClient();
  const response = await dodo.checkoutSessions.create({
    product_cart: [{ product_id: productIdForPlan(params.plan), quantity: 1 }],
    metadata: { audiotrace_checkout_ref: params.checkoutRef, audiotrace_plan: params.plan },
    return_url: `${params.appBaseUrl}/api/checkout/callback?ref=${encodeURIComponent(params.checkoutRef)}`,
    customer: params.customerEmail ? { email: params.customerEmail } : null,
  });
  if (!response.checkout_url) {
    throw new Error("Dodo did not return a checkout_url for this session.");
  }
  return { checkoutUrl: response.checkout_url, sessionId: response.session_id };
}

export type UnwrappedWebhookEvent = {
  type: string;
  business_id: string;
  timestamp: string;
  data: Record<string, unknown>;
};

/**
 * Verifies the webhook's signature (Standard Webhooks spec: webhook-id /
 * webhook-signature / webhook-timestamp headers, checked against
 * DODO_PAYMENTS_WEBHOOK_SECRET) and returns the parsed event. Throws if the
 * signature doesn't check out — callers must treat a thrown error as
 * "reject this request", never as "process anyway".
 */
export function unwrapWebhook(rawBody: string, headers: Headers): UnwrappedWebhookEvent {
  const dodo = getClient();
  const event = dodo.webhooks.unwrap(rawBody, {
    headers: {
      "webhook-id": headers.get("webhook-id") ?? "",
      "webhook-signature": headers.get("webhook-signature") ?? "",
      "webhook-timestamp": headers.get("webhook-timestamp") ?? "",
    },
  });
  return event as unknown as UnwrappedWebhookEvent;
}
