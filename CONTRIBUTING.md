# Contributing to Forgecast

Thanks for forging with us. Forgecast is designed so the highest-value contributions are also the easiest: **adding provider adapters**. This guide gets you running and shows you every seam.

## Setup

**Requirements:** Node ≥ 20, [pnpm](https://pnpm.io) ≥ 9.

```bash
pnpm install
pnpm test          # 141 tests, all offline — no keys, GPU, or Docker needed
pnpm typecheck     # strict tsc across every package
pnpm -C apps/web dev   # Studio at http://localhost:3210
```

Conventions:
- **TDD.** Write the failing test first, make it pass, keep the suite green.
- **Strict TypeScript** (`strict` + `noUncheckedIndexedAccess`). `pnpm typecheck` must pass.
- **Conventional commits** (`feat:`, `fix:`, `test:`, `refactor:`, `chore:`), one focused change each.
- Keep `@forgecast/core` **pure** — types and contracts only, no I/O.

## Project layout

```
apps/web         Next.js spine API + Studio UI
apps/mcp         MCP server (agent-drivable tool surface)
packages/core    pure types + contracts (the seams)
packages/providers  all adapters: image, video, TTS, montage, publish, presenter
packages/store   repositories + storage (in-memory, SQLite/FS, D1/R2)
packages/jobs    job runner + all handlers
packages/catalog typed model catalog
packages/agent   ContentAgent: LLM plan → execute → publish
workers/montage  Remotion render service (Docker)
workers/shorts   MoneyPrinterTurbo setup (Docker)
docs/            ARCHITECTURE.md, deploy + integration guides
```

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) first — it explains the spine, contracts, job engine, and deployment profiles.

---

## The #1 contribution: a provider adapter

Every generation backend is a small class implementing one interface from `@forgecast/core`. Nothing upstream changes — the registry selects it by name, and `isAvailable()` provides graceful degradation when unconfigured.

### Image provider

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
    const fetchFn = this.opts.fetchFn ?? fetch;  // inject → testable offline
    // ... call your API with input.prompt / input.width / input.height ...
    return { url: '<generated image url>' };
  }
}
```

Then:
1. **Write tests first** (`packages/providers/test/`) using a mocked `fetchFn` — success, missing-key, and error paths. Copy `fal.test.ts` as a template.
2. Export from `packages/providers/src/index.ts`.
3. Register in the composition root (`apps/web/lib/forgecast.ts`).

### Video provider

Implement `VideoProvider` from `@forgecast/core`. See `packages/providers/src/video/fal.ts` and `packages/providers/src/video/pixverse.ts` as references. Register in `ImageProviderRegistry`'s video counterpart.

### Publisher adapter

Implement `Publisher` from `@forgecast/core`:

```ts
interface Publisher {
  readonly platform: string;
  isAvailable(): boolean;
  publish(post: PublishPost): Promise<PublishResult>;
}
```

See `packages/providers/src/publish/instagram.ts` for a reference. Export it, add it to `PublisherRegistry` in the composition root, and document the required env vars in [`docs/social-setup.md`](docs/social-setup.md).

### TTS / voice provider

Implement `VoiceProvider` from `@forgecast/core`. See `packages/providers/src/voice/falTts.ts`.

### Presenter / avatar provider

Implement `PresenterProvider` from `@forgecast/core`. See `packages/providers/src/presenter/omnihuman.ts`.

---

## Other good first issues

- **Postgres repo implementations** — `ProjectRepo` / `AssetRepo` / `JobRepo` (same interfaces as SQLite impls in `packages/store/src/sqlite/`).
- **New `JobHandler`s** — e.g. a new video style or a different montage strategy. Implement `JobHandler`, register in `JobRunner` in the composition root.
- **Studio UI polish** — uses the "Molten Forge" design system in `apps/web/app/globals.css`. Components live in `apps/web/components/studio/`.
- **Agent tools** — extend `ContentAgent` in `packages/agent/src/agent.ts` with new plan directives or execution steps.
- **Local model adapters** — Stable Diffusion / ComfyUI image provider, Ollama script provider, Piper TTS. The path to a fully offline GPU-powered Forgecast.

---

## Pull requests

Keep PRs focused, tests green, `pnpm typecheck` clean. Describe which seam you touched and why. Use the pull request template.
