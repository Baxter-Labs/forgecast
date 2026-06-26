# @forgecast/web

The Forgecast Studio — a Next.js 16 (App Router) application that serves as both the **spine HTTP API** and the **Studio UI**.

## Running locally

```bash
# from the monorepo root
cp .env.example apps/web/.env.local       # fill in your API keys (all optional)
pnpm install
pnpm -C apps/web dev                      # http://localhost:3210
```

See the root [README](../../README.md) for the full list of environment variables and setup instructions.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start the dev server on port 3210 |
| `pnpm build` | Production Next.js build |
| `pnpm start` | Run the production build |
| `pnpm typecheck` | Strict TypeScript check |
| `pnpm cf:build` | Build for Cloudflare Workers (OpenNext) |
| `pnpm cf:preview` | Preview the Worker build locally (workerd) |
| `pnpm cf:deploy` | Build + deploy to Cloudflare Workers |

## Cloudflare deployment

See [`docs/DEPLOY-CLOUDFLARE.md`](../../docs/DEPLOY-CLOUDFLARE.md) for D1 + R2 setup and deployment steps.
