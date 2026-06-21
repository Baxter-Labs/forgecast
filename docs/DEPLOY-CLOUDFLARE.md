# Deploying Forgecast on Cloudflare Workers

Runs the Next.js spine + Studio UI (`apps/web`) as a Cloudflare Worker via the
[OpenNext](https://opennext.js.org/cloudflare) adapter, with generated asset
bytes stored in **Cloudflare R2** (the `baxter-cloud` profile).

Metadata (projects/assets/jobs) persists in **Cloudflare D1** (the `DB` binding),
so state survives across Worker isolates. A **Queues**-backed job runner for long
renders is a follow-up step. Heavy GPU work (MoneyPrinter shorts, Remotion
montage, local SD/VibeVoice) does not run on Workers and stays on a
container/GPU back-end (see `docs/ARCHITECTURE.md` §7).

## Prerequisites

- A Cloudflare account and an **API token** with **Workers Scripts**, **Workers R2 Storage**, and **D1** edit permissions.
- An R2 bucket: `wrangler r2 bucket create forgecast-media`.
- R2 **S3 API** credentials (Access Key ID + Secret) from the R2 dashboard.
- A D1 database: `wrangler d1 create forgecast-db` (copy the printed `database_id` into `wrangler.jsonc`).

## Configure

`apps/web/wrangler.jsonc` already sets the Worker name, `nodejs_compat`, the
static-assets binding, the **D1 binding** (`DB` → `forgecast-db`), and
`FORGECAST_PROFILE=baxter-cloud`. After `wrangler d1 create`, paste the returned
`database_id` into the `d1_databases` entry.

The schema self-initializes on first use; to pre-create it run:

```bash
wrangler d1 execute forgecast-db --remote --file apps/web/d1/schema.sql
```

Set secrets (production):

```bash
cd apps/web
wrangler secret put R2_ACCOUNT_ID
wrangler secret put R2_BUCKET            # e.g. forgecast-media
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
# optional:
wrangler secret put R2_PUBLIC_BASE_URL   # public bucket / CDN domain for serving
wrangler secret put FAL_KEY              # to actually generate images
wrangler secret put OMNISOCIALS_API_KEY  # to enable publishing (Studio "Cast")
```

### Publishing (the "Cast" panel)

The Studio publish panel only offers platforms when a publisher backend is
configured. The fast path is the **OmniSocials** aggregator — one key fans a post
out to Instagram, LinkedIn, YouTube, X, TikTok and more:

```bash
cd apps/web
wrangler secret put OMNISOCIALS_API_KEY   # then: pnpm --filter @forgecast/web cf:deploy
```

Verify it's live: `curl https://<your-worker>/api/health` should list
`"publishers": ["omnisocials"]`. If it returns `[]`, the secret isn't set on the
Worker (setting it only in `.env`/`.dev.vars` does **not** reach production — it
must be a `wrangler secret`).

For local preview, copy `.dev.vars.example` to `.dev.vars` and fill it in.

## Build, preview, deploy

```bash
pnpm --filter @forgecast/web cf:build      # next build + OpenNext bundle → .open-next/worker.js
pnpm --filter @forgecast/web cf:preview    # run locally on workerd (http://localhost:8788)
pnpm --filter @forgecast/web cf:deploy     # build + deploy to Cloudflare
```

Validate config without deploying:

```bash
cd apps/web && wrangler deploy --dry-run
```

## Notes

- `R2Storage` talks to R2 over its **S3 API** (AWS SigV4), so it works identically
  on a Worker and on a Node host — no separate code path. A native R2 *binding*
  (`r2_buckets` in `wrangler.jsonc`) is the more idiomatic Workers option and can
  replace the S3 path later.
- Metadata is stored in **D1** under `baxter-cloud`. If the `DB` binding is
  missing, the app logs a warning and falls back to in-memory (non-durable)
  metadata so it still boots.
- The D1 schema mirrors the local SQLite schema and is created lazily
  (`ensureD1Schema`) or via `apps/web/d1/schema.sql`.
