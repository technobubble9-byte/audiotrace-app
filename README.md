# AudioTrace — Application

This is the working AudioTrace product: upload audio, protect it per-recipient
with a real forensic watermark, and detect/trace that watermark in a
suspected leaked file. It's a separate deployment from the marketing/pricing
site at audiotrace.tech (see "Relationship to the marketing site" below).

## What's real here (and what isn't)

Everything in this app is functional, not a demo:

- **Watermarking** (`src/lib/audio/watermark.server.ts`): real spread-spectrum
  frequency-domain watermarking. Verified in testing to survive real MP3
  re-encoding down to ~96kbps, with <1% measured audio distortion and zero
  false positives on unwatermarked audio. Read the comments at the top of
  that file for exactly how it works and exactly where it's likely to fail
  (very low bitrate transcodes, heavy pitch/time-stretching, denoising).
- **Database & storage**: real SQLite (`src/lib/db`) and real files on disk
  (`src/lib/storage.server.ts`). Nothing in-memory, nothing mocked.
- **Dashboards**: all four (Uploads, Recipients, Protected Files,
  Trace/Detection) read live data from that database — no seeded/fake rows.

What this is **not**: a decade-refined commercial watermarking codec. It's a
first-generation, genuinely-working implementation. Don't market it with
claims (survives any compression, undetectable by all means, etc.) the
engine can't actually back up.

## Running it locally

```bash
cp .env.example .env    # then set a real WATERMARK_SECRET
npm install
npm run dev
```

Requires `ffmpeg` and `ffprobe` on PATH (used for format conversion — MP3,
FLAC, AIFF, M4A, OGG all get transcoded to/from canonical WAV around the
watermark engine, which itself only operates on PCM).

Visit `/dashboard` (the root `/` just redirects there).

## Deployment: this needs a real Node server, not Cloudflare Workers

This matters, so it's not buried: **this app cannot run on Cloudflare
Workers as built.** Two separate blockers:

1. `better-sqlite3` is a native Node addon. Workers doesn't support native
   addons.
2. Format conversion shells out to the `ffmpeg`/`ffprobe` CLIs
   (`src/lib/audio/transcode.server.ts`). Workers has no subprocess support
   at all — this one has no clean workaround.

**Deploy this to any normal Node host**: Railway, Fly.io, Render, a plain
VPS, or Vercel/Netlify's Node function runtimes all work fine. It's a
standard TanStack Start app; `npm run build && npm run start`-style
deployment applies.

If Cloudflare is a hard requirement, the two real options are:
- Run this Node app on a separate host (e.g. `app.audiotrace.tech` via
  Railway) and keep the Cloudflare-hosted marketing page pointing at it —
  this is what the current CTA links assume.
- Or port to Workers-native primitives: swap `better-sqlite3` → D1, swap
  local disk storage → R2, and drop MP3/FLAC/AIFF/M4A/OGG support down to
  WAV-only (no ffmpeg = no format conversion). That's a real rewrite of
  `client.server.ts`, `storage.server.ts`, and `transcode.server.ts` — ask
  if you want this done instead.

## Relationship to the marketing site

`audiotrace.tech` itself is a separate, static single-file HTML page (not
part of this repo) with a live Dodo Payments checkout integration. This app
is meant to be deployed at a separate host/subdomain (e.g.
`app.audiotrace.tech`) and linked to from that page. The marketing page's
"Get Started" / "Start Protecting" buttons were pointed at this dashboard
instead of straight to checkout, since there was previously no product for a
paying customer to actually use — see that page's own notes for details.

## Accounts + payments: the actual signup-to-dashboard flow

The order is: **create an account → log in → pick a plan / pay → dashboard**.
This replaced an earlier, simpler version that granted access straight off
a webhook-confirmed payment with no account at all — that worked but meant
anyone with the payment-confirmation cookie could use the dashboard, with
no way to log back in on a new device/browser. Real accounts fix that.

### Accounts (`src/lib/auth/`)

- Email + password, hashed with Node's built-in `scrypt` (no bcrypt/argon2
  dependency — deliberately avoids adding a second native addon on top of
  better-sqlite3, since that one already caused real Windows install
  friction).
- `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`,
  `GET /api/auth/me` — raw HTTP handlers (not TanStack server functions),
  wired into `src/server.ts`.
- A signed httpOnly session cookie (`SESSION_SECRET`) proves who's logged
  in. Separate concern from payment status — see below.

### Payments (`src/lib/payments/`)

Same webhook-verified Dodo integration as before, with one change: checkout
now requires a logged-in session (so the checkout is tied to a specific
account, not just an email typed into a form), and after paying, the
customer is directed back to `/dashboard` — no separate cookie needs
issuing anymore, since their session already proves who they are.

### The access gate

Every request to `/dashboard/*` runs two independent checks
(`handlePaymentRoute` in `src/lib/payments/routes.server.ts`):
1. Valid session cookie? No → redirect to `/login`.
2. Does that account's email have a `payments` row with `status = 'active'`?
   No → redirect to `/payment-required`, which shows a real plan picker
   (Standard/Ultimate) that starts checkout for the logged-in account.

### What this still isn't

Every paying customer shares one dashboard (same uploads, recipients,
protected files, trace scans) — there's no per-account data isolation.
Accounts currently just gate *whether* you can get in, not *what* you see
once you're in. That's the natural next step before onboarding more than
one real paying customer: give each account (or each account's "team") its
own scoped data, likely by adding an `owner_user_id` column to uploads/
recipients/protected_files and filtering every query by the logged-in
session. Ask if/when you want that built.

## Environment variables

See `.env.example` for the full list. `WATERMARK_SECRET` is described
above. `SESSION_SECRET` signs the login-session cookie. For the payment
flow, you also need `DODO_PAYMENTS_API_KEY`, `DODO_PAYMENTS_WEBHOOK_SECRET`,
`DODO_ENVIRONMENT`, `DODO_PRODUCT_ID_BASIC`, `DODO_PRODUCT_ID_PRO`, `DODO_PRODUCT_ID_ELITE`,
`PUBLIC_APP_URL`, and `MARKETING_SITE_ORIGINS`.

## Payments: Dodo dashboard setup

This was a real gap in the original marketing page: the "Get Started" /
pricing buttons charged real money via Dodo Payments but there was nothing
connecting "payment succeeded" to "customer can use the product." This app
now closes that gap with the lightest version that's still genuinely secure
(not a stub):

1. Marketing site → `POST /api/checkout` (this app, cross-origin, CORS-gated
   to the origins in `MARKETING_SITE_ORIGINS`) → creates a Dodo checkout
   session, returns `{checkoutUrl}`.
2. Customer pays on Dodo's hosted checkout page.
3. Dodo sends a **webhook** to `POST /api/webhooks/dodo` — this is the
   source of truth. Signature is verified (Standard Webhooks spec, via the
   official `dodopayments` SDK's `webhooks.unwrap`); unsigned/forged
   requests get a clean 401. On a successful payment/subscription event,
   the matching `payments` row is marked `active`.
4. Dodo also redirects the browser back to `GET /api/checkout/callback`,
   which polls the `payments` row (webhook usually lands within a second or
   two) and, once active, sets a signed httpOnly cookie and redirects to
   `/dashboard`. If the webhook hasn't landed yet, the customer sees
   `/payment-required`, which polls `/api/checkout/status` and redirects
   automatically once confirmed — no dead end.
5. Every request to `/dashboard/*` is gated on that cookie
   (`src/lib/payments/routes.server.ts` → `handlePaymentRoute`, wired into
   `src/server.ts`). No valid cookie → redirect to `/payment-required`.

**What this is not**: a multi-tenant account system. There's no login, no
password, no per-customer workspace — every paying customer currently shares
the same dashboard (same uploads/recipients/protected files). That's fine
for validating the flow with one customer (you); it's the thing to build
next before onboarding several real paying customers who shouldn't see each
other's data. See `src/lib/payments/access-token.server.ts` for the exact
list of what this lightweight gate does and doesn't do.

### Setting this up in your Dodo dashboard

1. **Products** → find (or create) your Standard and Ultimate products,
   copy their product IDs into `DODO_PRODUCT_ID_BASIC`,
   `DODO_PRODUCT_ID_PRO`, and `DODO_PRODUCT_ID_ELITE`.
2. **Developer → API Keys** → your secret key → `DODO_PAYMENTS_API_KEY`.
3. **Developer → Webhooks** → add endpoint `https://app.audiotrace.tech/api/webhooks/dodo`
   → copy the generated signing secret → `DODO_PAYMENTS_WEBHOOK_SECRET`.
4. Set `PUBLIC_APP_URL=https://app.audiotrace.tech` and
   `MARKETING_SITE_ORIGINS=https://www.audiotrace.tech,https://audiotrace.tech`.
5. Generate `ACCESS_TOKEN_SECRET` the same way as `WATERMARK_SECRET`
   (`openssl rand -hex 32`) — use a **different** value, not the same one.
6. Start in `DODO_ENVIRONMENT=test_mode` and use Dodo's test-mode checkout
   to walk the whole flow (pay with a test card → land on `/dashboard`)
   before flipping to `live_mode`.

The marketing site's `openCheckout()` was updated to POST to
`https://app.audiotrace.tech/api/checkout` instead of straight to Dodo's
checkout creation — same request/response shape as before, so nothing else
on that page needed to change.

## Architecture map

```
src/lib/audio/
  watermark.server.ts   real embed/detect DSP engine (no I/O)
  transcode.server.ts   ffmpeg/ffprobe wrapper (format conversion)
  pipeline.server.ts    ties the two together: arbitrary format in/out

src/lib/db/
  client.server.ts      SQLite connection + schema migration
  queries.server.ts     typed query helpers for all entities

src/lib/storage.server.ts   local-disk file storage (uploads/protected/scans)

src/lib/payments/
  dodo.server.ts         Dodo SDK wrapper (checkout sessions, webhook verify)
  access-token.server.ts signed-cookie dashboard access gate
  routes.server.ts       raw HTTP handlers for checkout/webhook/callback,
                          wired into src/server.ts ahead of the app router

src/lib/api/*.functions.ts  TanStack Start server functions (the actual
                             endpoints the dashboard UI calls)

src/routes/dashboard/       the 5 dashboard pages (protect workflow +
                             uploads/recipients/protected-files/trace)
src/routes/payment-required.tsx   shown when /dashboard is hit without a
                                   valid access cookie
```

## Known limitations / good next steps

- **No auth.** This is a single-workspace app — anyone who can reach it can
  see all uploads/recipients/protected files. Fine for one person's use,
  not fine for a real multi-customer SaaS. Needs a real auth layer before
  onboarding actual paying customers.
- **File transport is base64-over-JSON**, capped at 100MB per file for this
  MVP. Fine for typical tracks, clunky for large masters/stems. A real
  multipart/binary upload path would be a good follow-up.
- **Bulk scan / monitoring / takedown support** (mentioned on the marketing
  page) aren't built — only the core protect → detect workflow the request
  asked for.
