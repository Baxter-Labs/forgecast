# Platform readiness: UX logic, auth end-to-end, deploy as a website

**Date:** 2026-07-05 · **Status:** approved (owner brief: "fix the UI/UX logic parts, proper
architecture, Google auth + sign-in tools end to end, deployable as a website in 2–3 days")

## Why now

Forgecast is feature-complete as a single-operator tool (image/video/voice/shorts/ads/editor,
424 tests, MCP surface). To deploy it publicly as a website it needs (1) coherent UX logic,
(2) real authentication, (3) per-user data isolation, and (4) a documented deploy path.
This spec locks the architecture so the work can proceed in reviewable phases.

## Phase 0 — UX logic fixes (campaigns become optional)

**Problem.** Every forge mode — including the timeline **Editor**, which only *arranges
existing assets* — is hard-gated on selecting a campaign ("SELECT A CAMPAIGN FIRST").
Campaigns are local-storage organizers, not a server concept; blocking generation on them
is backwards and kills first-run UX (nothing works until you invent a campaign name).

**Fix (logic, not cosmetics).**
- Forging never requires a campaign. `canForge` drops the `hasCampaign` clause in every mode.
- If a campaign **is** selected, results still auto-attach to it (unchanged behavior).
- The campaign selector is labeled as what it is: *optional output organizer*.
- Results always land in the Gallery regardless (already true — `refreshAssets` on job done).

## Phase 0b — Dedicated editor workspace (`/editor`)

The timeline editor currently lives inside the 380px Create column — "inside the campaign"
visually and logically. A video editor needs room. Add a full-width `/editor` route:
three-zone layout (asset drawer · timeline lane · clip inspector), same saved timeline
document + `GET/PUT /timeline` + `POST /timeline/render` + MCP tools (one doc, three drivers:
UI page, Studio quick tab, agents). The Studio Editor tab stays as the quick version with a
prominent "Open full editor →" link.

## Phase 1 — Auth core (hand-rolled Google OAuth, env-gated)

**Decision: no auth SDK.** The repo's spine rule is raw injectable `fetch`, offline-mock
tests, zero heavy deps (see AnthropicLlmClient). Google's authorization-code flow is three
requests; we own it:

1. `GET /api/auth/google` → 302 to `accounts.google.com/o/oauth2/v2/auth`
   (client_id, redirect_uri, scope `openid email profile`, `state` = random nonce in a
   short-lived httpOnly cookie, `code_challenge` PKCE S256).
2. `GET /api/auth/callback?code&state` → verify state → POST `oauth2.googleapis.com/token`
   (code + verifier) → GET `openidconnect.googleapis.com/v1/userinfo` with the access token
   (avoids local JWT/JWKS verification — Google answers who the user is over TLS).
3. Upsert user → issue **session cookie**: `fc_session=<payload>.<hmac>` — base64url JSON
   `{uid, exp}` signed HMAC-SHA256 with `AUTH_SECRET` (node:crypto, zero deps), httpOnly,
   Secure, SameSite=Lax, 30-day exp. `GET /api/auth/session` → `{user}` or `{user:null}`.
   `POST /api/auth/signout` clears it.

**Env-gating (preserves the OSS story).** `authEnabled = GOOGLE_CLIENT_ID && AUTH_SECRET`.
- **Unset (self-host default):** platform behaves exactly as today — open, single-operator,
  every request acts as the implicit `local` user. All existing tests keep passing unchanged.
- **Set (hosted website):** API routes require a valid session; the Studio shows sign-in.

New store contracts in `@forgecast/core`: `UserRecord {id, email, name, avatarUrl,
createdAt}` + `UserRepo` (get/getByEmail/upsert). Sessions are stateless (signed cookie),
so no session table; sign-out = clear cookie (acceptable for 30-day consumer sessions).
Google endpoints hit through `Services.fetchFn` → fully mockable; PKCE/state/cookie logic
pure-tested.

## Phase 2 — Multi-tenancy (user-scoped data)

- `Project` gains `ownerId` (default `'local'`). Sqlite: additive column via
  migration-on-open (`ALTER TABLE … ADD COLUMN` guarded by pragma check); in-memory + D1
  mirrors.
- `ProjectRepo.list(ownerId)` filters; create stamps the owner.
- One guard in `apps/web/lib/api.ts`: `resolveUser(services, cookieHeader)` → `'local'`
  when auth disabled, else verified `uid` or `401`. Every project/asset/job route resolves
  the user and checks ownership through the asset/job's `projectId → project.ownerId` chain.
- MCP/self-host is unaffected (auth off → `local` owner). Hosted MCP access via API tokens
  is **out of scope** for this pass (documented as a limitation).

## Phase 3 — Auth UI

- `/signin` page: Molten Forge, single "Continue with Google" action, error states
  (`?error=` from callback), redirect-back support.
- Header: avatar + name + sign-out menu when signed in; the page redirects to `/signin`
  when auth is enabled and no session exists.
- Signed-out API calls return 401 JSON; the Studio hook surfaces "signed out" gracefully.

## Phase 4 — Deploy readiness

- **Primary target: Vercel** (Next-native, the owner's existing deploy muscle); the
  Cloudflare Workers profile stays as the alternate (cookie auth is runtime-agnostic).
- Persistence on Vercel: default sqlite/fs is ephemeral — document the two supported
  profiles: (a) CF Workers + D1/R2 (already built), (b) Vercel + a mounted volume or
  the D1/R2 HTTP profile. For the 2–3-day deadline: deploy on Vercel with explicit
  "media resets on redeploy unless a durable profile is configured" callout, or CF Workers
  where D1/R2 are first-class. Decision at deploy time with the owner.
- Google Cloud Console checklist in README: OAuth client, authorized redirect
  `https://<domain>/api/auth/callback`, consent screen.
- Envs: `AUTH_SECRET` (32+ bytes), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `FORGECAST_BASE_URL` (absolute, for redirect_uri), plus existing provider keys.
- Full-suite + production build + auth E2E smoke before hand-off.

## Phasing & workflow

Each phase = branch → PR → CI → merge (no direct-to-main). Order: 0 → 0b → 1 → 2 → 3 → 4.
Tests-first where logic is pure (cookie signing, PKCE, guards); mock-fetch for Google.

## Out of scope (documented, deliberate)

Email/password + magic links (needs an email provider), org/team workspaces, API tokens
for hosted MCP, billing-per-user (Mollie stays instance-level), rate limiting (add at the
edge on deploy).
