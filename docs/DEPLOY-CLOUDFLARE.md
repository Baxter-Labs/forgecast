# Deploying Forgecast on Cloudflare Workers

Runs the Next.js spine + Studio UI (`apps/web`) as a Cloudflare Worker via the
[OpenNext](https://opennext.js.org/cloudflare) adapter. Metadata (projects · assets ·
jobs · **users · keys**) persists in **Cloudflare D1** (the `DB` binding); generated
asset bytes persist in **Cloudflare R2** (the `baxter-cloud` profile). Both survive
across Worker isolates.

This runbook targets the **public, multi-user, bring-your-own-keys** deployment: each
visitor signs in with Google, gets a private workspace, and sets their own provider keys
in the Studio's **Keys** panel — nobody can see or spend anyone else's keys. **Image and
voice-over generation work keyless by default** via Cloudflare Workers AI (the `ai`
binding, free daily neuron tier — FLUX schnell for images, MeloTTS for TTS at ~9 free
audio-hours/day), so the site is usable the moment it's deployed. **Video is NOT keyless
on Workers AI** (every CF video model is partner-billed): free video comes from the
stills-reel montage pipeline (unlimited) and from open models on Hugging Face ZeroGPU
Spaces — each user adds a **free** HF token in the Keys panel (~5 GPU-min/day). BYO
fal/Replicate keys add premium models on top. Heavy GPU work (MoneyPrinter shorts, Remotion montage, local
SD/VoxCPM) does not run on Workers and stays on a container/GPU back-end (see
`docs/ARCHITECTURE.md`).

All commands run from `apps/web/`.

## Already provisioned

- ✅ **Workers build is green** — `pnpm cf:build` → `.open-next/worker.js`.
- ✅ **D1 database `forgecast-db`** (id `ac1bb4bc-4d4c-4a5a-b8b6-fb5fdbf4233b`), schema
  initialized (projects · assets · jobs · users · user_keys), bound as `DB` in
  `wrangler.jsonc`. Schema also self-initializes on first use.

## One-time account setup

### 1. R2 (durable media storage — required)

On Workers there is no local disk, so generated media lives in R2. Without it, assets are
lost between requests.

1. Cloudflare dashboard → **R2** → **Enable** (free tier: 10 GB + zero egress; a card is
   required to turn it on).
2. Create a bucket **`forgecast-media`**.
3. R2 → **Manage API Tokens** → create an **S3 Access Key** (Object Read & Write) → save
   the **Access Key ID** + **Secret Access Key**, and note your **R2 account id** (the hex
   in `https://<account>.r2.cloudflarestorage.com`).

### 2. Google OAuth client (sign-in)

1. [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** →
   **Credentials** → **Create OAuth client ID** → **Web application**.
2. Add the Authorized redirect URI **after the first deploy** (step 6) once the URL exists.
3. Save the **Client ID** + **Client Secret**.

### 3. Authenticate wrangler on this machine

```bash
npx wrangler login       # one-time browser OAuth; token is stored locally
npx wrangler whoami      # confirm the account
```

## Deploy

### 4. Set the Worker secrets

```bash
cd apps/web

openssl rand -base64 32 | npx wrangler secret put AUTH_SECRET   # session + key encryption
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put R2_ACCOUNT_ID
npx wrangler secret put R2_BUCKET               # forgecast-media
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
# optional:
npx wrangler secret put R2_PUBLIC_BASE_URL      # public bucket / CDN domain for serving media
npx wrangler secret put FAL_KEY                 # OPTIONAL premium image/video; images+voice are already keyless via Workers AI
npx wrangler secret put HF_TOKEN                # OPTIONAL instance-wide free-video default (users normally add their own free token)
npx wrangler secret put OMNISOCIALS_API_KEY     # enable the "Cast" publish panel
npx wrangler secret put WISPRFLOW_API_KEY       # enable voice input in the agent
```

> **Image + voice generation are keyless by default** via Cloudflare Workers AI (the `ai`
> binding) — no key needed. Free video needs a **free** HF token per user (Keys panel).
> Premium **provider keys are the users' job**: fal /
> OpenAI / Anthropic / Pexels / Wispr are set per-user in the Keys panel (encrypted at rest
> with `AUTH_SECRET`) and take precedence over any instance secret. An instance `FAL_KEY`
> just adds a shared premium option. A `.env` / `.dev.vars` value does **not** reach
> production — it must be a `wrangler secret`.

### 5. First deploy

```bash
pnpm cf:deploy     # next build + OpenNext bundle + deploy
```

Note the printed URL, e.g. `https://forgecast-web.<your-subdomain>.workers.dev`.

### 6. Wire the public origin + OAuth redirect, then redeploy

1. In `wrangler.jsonc` `vars`, add
   `"FORGECAST_BASE_URL": "https://forgecast-web.<your-subdomain>.workers.dev"`
   (required — until set, OAuth redirects to `http://localhost:3210`).
2. In the Google OAuth client (step 2), add the Authorized redirect URI
   `https://forgecast-web.<your-subdomain>.workers.dev/api/auth/callback`.
3. `pnpm cf:deploy` again.

### 7. (Optional) Editor & montage export — deploy the render worker

The **Editor** timeline export and **Montage** mode stitch clips into one mp4 with
Remotion + headless Chromium — compute that can't run inside a Worker. Deploy the bundled
render worker to any always-on Docker host and point the site at it. Without this, image
and video **generation** still work; only timeline/montage **export** is disabled on the site.

Using Fly.io (a `fly.toml` is included):

```bash
cd workers/montage
fly launch --no-deploy        # create the app (accept the included fly.toml)
fly deploy                    # build the Docker image + deploy
fly secrets set MONTAGE_PUBLIC_URL=https://<your-app>.fly.dev   # so returned mp4 URLs are reachable
```

Any Docker host works — the service exposes `POST /render`, `GET /render/:id` and
`GET /health` on port 8787 (see `workers/montage/README.md`). Then tell the Worker where it
is and redeploy:

```bash
cd apps/web
npx wrangler secret put MONTAGE_WORKER_URL     # https://<your-app>.fly.dev
pnpm cf:deploy
```

`/api/health` will then list `montage` and the Editor's export button works (with captions
+ transitions, via Remotion).

## Verify it's live

1. Open the URL → **/signin** → **Continue with Google** → land in the Studio.
2. Header shows your account; the **Studio ⇄ Editor** tabs switch pages.
3. `curl https://<url>/api/health` → `200`. Open **Keys** (header chip) → paste a `fal`
   key → the Image tab lights up immediately (no redeploy).
4. Forge an image, refresh → it persists (D1 metadata + R2 bytes).

Validate config without deploying: `npx wrangler deploy --dry-run`.
Local preview on workerd: `pnpm cf:preview` (fill `.dev.vars` from `.dev.vars.example`).

## Notes

- **Encryption:** per-user keys are AES-256-GCM sealed with `AUTH_SECRET`. Rotating it
  invalidates stored keys (users re-enter them) and all sessions.
- **Publishing / voice availability:** `/api/health` lists what's live; `publishers: []`
  or `transcribe: []` means the secret isn't on the Worker (a `.dev.vars` value won't reach prod).
- **Storage path:** `R2Storage` uses R2's **S3 API** (SigV4), identical on Workers and Node.
  A native R2 *binding* (`r2_buckets` in `wrangler.jsonc`) is the more idiomatic option and
  can replace the S3 path later. If the `DB` binding is missing, the app warns and falls
  back to non-durable in-memory metadata so it still boots.
- **Custom domain:** add a Worker route, set `FORGECAST_BASE_URL` to it, and add the
  matching Google redirect URI.
- **Hosted MCP** has no API-token auth yet — keep MCP pointed at a local instance, or front
  the API with Cloudflare Access before exposing it.
