# Contributing to Forgecast

Thanks for forging with us. Forgecast is designed so the highest-value contributions are also the easiest: **adding provider adapters**. This guide gets you running and shows you the seams.

## Setup

**Requirements:** Node ≥ 20, [pnpm](https://pnpm.io) ≥ 9.

```bash
pnpm install
pnpm test          # full suite (offline — no keys/GPU/DB needed)
pnpm typecheck     # strict tsc across every package
pnpm -C apps/web dev   # the Studio at http://localhost:3210
```

Conventions:
- **TDD.** Write the failing test first, make it pass, keep the suite green.
- **Strict TypeScript** (`strict` + `noUncheckedIndexedAccess`). `pnpm typecheck` must pass.
- **Conventional commits** (`feat:`, `fix:`, `test:`, `refactor:`, `chore:`), one focused change each.
- Keep `@forgecast/core` **pure** — types and contracts only, no I/O.

## Project layout

```
apps/web         Next.js spine API + Studio UI
packages/core    pure types + contracts (the seams)
packages/providers  provider registry + adapters   ← most contributions land here
packages/store   repositories + storage
packages/jobs    job runner + handlers
packages/catalog typed model catalog
docs/            specs, plans, ARCHITECTURE.md
```

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) first — it explains the spine in 8 short sections.

## The #1 contribution: a provider adapter

Every generation backend is a small class implementing one interface. Nothing upstream changes — the registry selects it by name, and `isAvailable()` makes it degrade gracefully when unconfigured.

**Example — a new image provider.** Implement `ImageProvider` from `@forgecast/core`:

```ts
import {
  ProviderUnavailableError,
  type ImageProvider, type GenerateImageInput, type ImageResult,
} from '@forgecast/core';

export class MyImageProvider implements ImageProvider {
  readonly name = 'my-provider';
  constructor(private opts: { apiKey?: string; fetchFn?: typeof fetch } = {}) {}

  isAvailable(): boolean {
    return Boolean(this.opts.apiKey ?? process.env.MY_PROVIDER_KEY);
  }

  async generateImage(input: GenerateImageInput): Promise<ImageResult> {
    if (!this.isAvailable()) throw new ProviderUnavailableError(this.name);
    const fetchFn = this.opts.fetchFn ?? fetch;   // inject fetch → testable offline
    // ...call your API with input.prompt / input.width / input.height...
    return { url: '<generated image url>' };
  }
}
```

Then:
1. **Write tests first** (`packages/providers/test/`) using a mocked `fetchFn` — success, missing-key, and error paths. Copy `fal.test.ts` as a template.
2. Export it from `packages/providers/src/index.ts`.
3. Register it in the app's composition root (`apps/web/lib/forgecast.ts`).

**Local models are especially welcome** — a Stable Diffusion / ComfyUI image provider, an Ollama script provider, a Piper or VibeVoice TTS provider. They're the path to a fully offline, GPU-powered Forgecast, and they all follow this exact shape.

## Other good first issues

- Postgres implementations of `ProjectRepo` / `AssetRepo` / `JobRepo` (same interfaces).
- An S3/MinIO `StorageDriver`.
- New `JobHandler`s (e.g. a video handler) behind the existing `JobRunner`.
- Studio UI polish (it uses the "Molten Forge" system in `apps/web/app/globals.css`).

## Pull requests

Keep PRs focused, tests green, `pnpm typecheck` clean. Describe what seam you touched and why. Be excellent to each other. 🔥
