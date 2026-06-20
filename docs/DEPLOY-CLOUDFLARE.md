# Deploying Forgecast on Cloudflare Workers

Runs the Next.js spine + Studio UI (`apps/web`) as a Cloudflare Worker via the
[OpenNext](https://opennext.js.org/cloudflare) adapter, with generated asset
bytes stored in **Cloudflare R2** (the `baxter-cloud` profile).

This is step 1 of the Cloudflare path. Metadata (projects/assets/jobs) currently
lives **in-memory** on the edge — durable edge metadata via **D1/Hyperdrive** and
a **Queues**-backed job runner for long renders are follow-up steps. Heavy GPU
work (MoneyPrinter shorts, Remotion montage, local SD/VibeVoice) does not run on
Workers and stays on a container/GPU back-end (see `docs/ARCHITECTURE.md` §7).

## Prerequisites

- A Cloudflare account and an **API token** with Workers + R2 permissions.
- An R2 bucket: `wrangler r2 bucket create forgecast-media`.
- R2 **S3 API** credentials (Access Key ID + Secret) from the R2 dashboard.

## Configure

`apps/web/wrangler.jsonc` already sets the Worker name, `nodejs_compat`, the
static-assets binding, and `FORGECAST_PROFILE=baxter-cloud`.

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
```

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
- Because metadata is in-memory per isolate today, projects/jobs are not durable
  across requests/deploys yet — wire D1 (step 2) before relying on persistence.
