# Forgecast M1 — Plan 2c-4: Image Studio UI ("Molten Forge")

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development + frontend-design principles. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A distinctive, production-grade Image Studio: prompt → model picker (from `@forgecast/catalog`) → aspect ratio → **Forge** → live status → gallery of generated images, wired to the 2c-2 routes, with an image-serving route so generated images actually display.

**Aesthetic — "Molten Forge":** dark warm-charcoal "workshop" canvas, molten amber→orange→ember accents used sparingly and powerfully (the Forge button, active heat states), grain + a faint ember glow for atmosphere, sharp metal-plate panels. Type: **Bricolage Grotesque** (display/wordmark), **IBM Plex Sans** (body), **IBM Plex Mono** (technical readouts: model ids, dimensions, job ids, status). Heat-based motion. NO generic AI-slop (no Inter, no purple-on-white, no cookie-cutter cards).

**Repo:** `~/Desktop/BaxterLabs/forgecast` (2c-1/2/3 done: spine API live, `@forgecast/catalog` exports `imageModels` (51); shadcn base components present; 48 tests).

---

## Decomposition (3 tasks)
- **Task 1** — image-serving: extend `StorageDriver` with `get`, implement in `InMemoryStorage`, add `GET /api/assets/[id]/raw`. (Lets the gallery show real bytes.) TDD on the logic.
- **Task 2** — theme foundation: fonts (`layout.tsx`) + the Molten Forge design system (`globals.css`). Deterministic code below.
- **Task 3** — the Studio: data hook + components + page, art-directed.

---

## Task 1: Image-serving (storage.get + asset-raw route)

**Files:**
- Modify: `packages/core/src/storage.ts`, `packages/store/src/memory/storage.ts`, `packages/core/test/contracts.test.ts`
- Modify: `apps/web/lib/api.ts`; create `apps/web/app/api/assets/[id]/raw/route.ts`
- Test: `apps/web/test/api.test.ts` (extend)

- [ ] **Step 1: Extend `StorageDriver` in `packages/core/src/storage.ts`** — add a `StoredBytes` type and a `get` method:

```ts
export interface StoredObject {
  key: string;
  url: string;
}

export interface StoredBytes {
  data: Uint8Array;
  contentType: string;
}

export interface StorageDriver {
  /** Stores bytes under `key` and returns the stored object's key + retrievable url. */
  put(key: string, data: Uint8Array, contentType: string): Promise<StoredObject>;
  /** Retrieves stored bytes by key, or null if absent. */
  get(key: string): Promise<StoredBytes | null>;
  /** The url at which `key` can be retrieved. */
  url(key: string): string;
}
```

- [ ] **Step 2: Implement `get` in `packages/store/src/memory/storage.ts`** — add the method (keep `read` as-is for existing tests):

```ts
  async get(key: string): Promise<StoredBytes | null> {
    return this.objects.get(key) ?? null;
  }
```
Add `StoredBytes` to the import from `@forgecast/core`. (The `StoredBytes` shape matches the existing private `StoredBytes` interface; you may reuse the imported type and delete the local duplicate, or keep both — ensure types align.)

- [ ] **Step 3: Update `packages/core/test/contracts.test.ts`** — the `FakeStorage` must now implement `get`. Add:

```ts
  async get(key: string) {
    return key === 'img/1.png' ? { data: new Uint8Array([1, 2, 3]), contentType: 'image/png' } : null;
  }
```
(Insert inside the `FakeStorage` class.)

- [ ] **Step 4: Add serving logic to `apps/web/lib/api.ts`** — append:

```ts
export async function getAssetBytes(
  services: Services,
  assetId: string,
): Promise<{ data: Uint8Array; contentType: string } | null> {
  const asset = await services.assets.get(assetId);
  if (!asset) return null;
  return services.storage.get(asset.storageKey);
}
```

- [ ] **Step 5: Extend `apps/web/test/api.test.ts`** with a serving test (add inside the file, reusing the `services()` helper + a generated asset):

```ts
import { getAssetBytes } from '../lib/api';

describe('api: asset bytes', () => {
  it('returns stored bytes for a generated asset, null for unknown', async () => {
    const svc = services();
    const created = await createProject(svc, { name: 'P' });
    const projectId = (created.body as { project: { id: string } }).project.id;
    const gen = await generateImage(svc, projectId, { prompt: 'a fox' });
    const assetId = (gen.body as { asset: { id: string } }).asset.id;

    const bytes = await getAssetBytes(svc, assetId);
    expect(bytes?.contentType).toBe('image/png');
    expect(bytes?.data.length).toBeGreaterThan(0);

    expect(await getAssetBytes(svc, 'nope')).toBeNull();
  });
});
```

- [ ] **Step 6: Create `apps/web/app/api/assets/[id]/raw/route.ts`** (binary Response, not JSON):

```ts
import { getServices } from '@/lib/forgecast';
import { getAssetBytes } from '@/lib/api';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const bytes = await getAssetBytes(getServices(), id);
  if (!bytes) return new Response('not found', { status: 404 });
  return new Response(bytes.data as unknown as BodyInit, {
    status: 200,
    headers: { 'content-type': bytes.contentType, 'cache-control': 'no-store' },
  });
}
```

- [ ] **Step 7:** `pnpm test` (PASS, new tests), `pnpm typecheck` clean, `pnpm --filter @forgecast/web build` ok. Commit: `feat(web): asset-serving route + StorageDriver.get`.

---

## Task 2: Theme foundation (fonts + Molten Forge design system)

**Files:** replace `apps/web/app/layout.tsx` and `apps/web/app/globals.css`.

- [ ] **Step 1: `apps/web/app/layout.tsx`** — load the fonts and set CSS vars. (Keep `metadata`; set a Forgecast title.)

```tsx
import type { Metadata } from 'next';
import { Bricolage_Grotesque, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const display = Bricolage_Grotesque({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-display' });
const body = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-body' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Forgecast — Studio',
  description: 'Self-hosted, open-source AI content forge. Forge it, cast it.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: `apps/web/app/globals.css`** — REPLACE the create-next-app default with the Molten Forge system. (Tailwind v4 uses `@import "tailwindcss"`.)

```css
@import "tailwindcss";

:root {
  --forge-bg: #100d0b;
  --forge-surface: #1a1512;
  --forge-surface-2: #221b16;
  --forge-border: #322821;
  --forge-text: #f5eee6;
  --forge-muted: #a2968a;
  --forge-faint: #6b5e54;
  --ember-1: #ffc24b;
  --ember-2: #ff7a1a;
  --ember-3: #e5331b;
  --ember-glow: rgba(255, 122, 26, 0.45);
  --molten: linear-gradient(135deg, var(--ember-1), var(--ember-2) 55%, var(--ember-3));
}

html { color-scheme: dark; }

body {
  background-color: var(--forge-bg);
  color: var(--forge-text);
  font-family: var(--font-body), ui-sans-serif, system-ui, sans-serif;
  /* ember glow from the top + soot grain */
  background-image:
    radial-gradient(60rem 40rem at 50% -10rem, rgba(255, 122, 26, 0.10), transparent 70%),
    radial-gradient(40rem 30rem at 90% 0, rgba(229, 51, 27, 0.06), transparent 70%);
  background-attachment: fixed;
}

/* soot grain overlay */
body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 50;
  opacity: 0.05;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

.font-display { font-family: var(--font-display), sans-serif; }
.font-mono { font-family: var(--font-mono), ui-monospace, monospace; }

/* molten gradient text (for the CAST in the wordmark, etc.) */
.text-molten {
  background: var(--molten);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

/* metal-plate panel */
.panel {
  background-color: var(--forge-surface);
  border: 1px solid var(--forge-border);
  border-radius: 0.75rem;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03), 0 12px 30px -12px rgba(0, 0, 0, 0.6);
}

/* the Forge (generate) button: molten + glow */
.btn-forge {
  background: var(--molten);
  color: #1a0c03;
  font-family: var(--font-mono), monospace;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  box-shadow: 0 0 0 1px rgba(255, 194, 75, 0.4), 0 8px 28px -6px var(--ember-glow);
  transition: transform 0.15s ease, box-shadow 0.25s ease, filter 0.2s ease;
}
.btn-forge:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 0 0 1px rgba(255, 194, 75, 0.6), 0 14px 40px -6px var(--ember-glow); filter: brightness(1.05); }
.btn-forge:active:not(:disabled) { transform: translateY(0); }
.btn-forge:disabled { opacity: 0.45; filter: grayscale(0.4); cursor: not-allowed; box-shadow: 0 0 0 1px var(--forge-border); }

/* heat bar (job progress) */
.heatbar > span { background: var(--molten); box-shadow: 0 0 16px var(--ember-glow); }

@keyframes forge-pulse { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }
.forging { animation: forge-pulse 1.1s ease-in-out infinite; }

@keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.rise { animation: rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
```

- [ ] **Step 3:** `pnpm --filter @forgecast/web build` ok. Commit: `feat(web): Molten Forge theme — fonts + design system`.

---

## Task 3: The Studio (data hook + components + page)

**Files:** create `apps/web/lib/use-forgecast.ts`; `apps/web/components/studio/*`; replace `apps/web/app/page.tsx`.

- [ ] **Step 1: Data hook `apps/web/lib/use-forgecast.ts`** ('use client')

```ts
'use client';
import { useCallback, useEffect, useState } from 'react';

export interface StudioAsset {
  id: string;
  params: { prompt?: string; width?: number; height?: number; model?: string };
  provider: string;
  createdAt: string;
}

interface GenerateArgs { prompt: string; model?: string; width?: number; height?: number }

export function useForgecast() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [providers, setProviders] = useState<string[]>([]);
  const [assets, setAssets] = useState<StudioAsset[]>([]);
  const [status, setStatus] = useState<'idle' | 'forging' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const health = await fetch('/api/health').then((r) => r.json()).catch(() => null);
      setProviders(health?.providers?.image ?? []);
      const list = await fetch('/api/projects').then((r) => r.json()).catch(() => ({ projects: [] }));
      let id: string | undefined = list.projects?.[0]?.id;
      if (!id) {
        const created = await fetch('/api/projects', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'My Forge' }),
        }).then((r) => r.json());
        id = created.project.id;
      }
      setProjectId(id!);
      const a = await fetch(`/api/projects/${id}/assets`).then((r) => r.json()).catch(() => ({ assets: [] }));
      setAssets((a.assets ?? []).slice().reverse());
    })();
  }, []);

  const generate = useCallback(async (args: GenerateArgs) => {
    if (!projectId) return;
    setStatus('forging'); setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args),
      }).then((r) => r.json());
      if (res.job?.status === 'done' && res.asset) {
        setAssets((prev) => [res.asset, ...prev]); setStatus('idle');
      } else {
        setError(res.job?.error ?? 'Generation failed'); setStatus('error');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error'); setStatus('error');
    }
  }, [projectId]);

  return { projectId, providers, assets, status, error, generate };
}
```

- [ ] **Step 2: Build the components** in `apps/web/components/studio/` per this art direction. Use the `.panel`, `.btn-forge`, `.text-molten`, `.font-display`, `.font-mono`, `.heatbar`, `.rise` classes + Tailwind. shadcn `textarea`/`select`/`button` may be used but must be restyled to the theme (do NOT ship default shadcn light look).

  - **`Header.tsx`** — top bar: wordmark **`FORGE`** in `.font-display` 800 (forge-text) + **`CAST`** in `.text-molten`, oversized, tight tracking. Small `.font-mono` tagline under/next: `forge it · cast it`. Right side: a provider status chip in `.font-mono` — `fal` with a filled ember dot if `providers.includes('fal')`, else a hollow dot + muted `no key`. A thin molten hairline under the header.
  - **`ForgePanel.tsx`** (left, the controls; in a `.panel`): 
    - `.font-mono` label `PROMPT`; a large dark textarea (bg `--forge-surface-2`, border `--forge-border`, focus ring ember) with an evocative placeholder ("A lone anvil glowing in a dark smithy, embers rising…").
    - `.font-mono` label `MODEL`; a select listing `imageModels` (from `@forgecast/catalog`) showing `name` + a `.font-mono` dimmed `id`. Default to the first model. (Note in a small caption: backend currently forges via the `fal` provider; the catalog is the selectable model surface.)
    - `.font-mono` label `RATIO`; aspect-ratio chips (from the selected model's `aspectRatios`, falling back to `['1:1','16:9','9:16','4:3']`). Selected chip gets an ember outline/glow. Map ratio → width/height (e.g. base 1024: 1:1→1024×1024, 16:9→1024×576, 9:16→576×1024, 4:3→1024×768).
    - The **Forge** button: full-width `.btn-forge`, label `FORGE →` (or a small hammer glyph). Disabled when prompt empty or `status==='forging'`. While forging, show `FORGING…` and the `.forging` pulse.
  - **`JobStatus.tsx`** — under/above the gallery: when `status==='forging'`, a `.heatbar` (track + molten-fill `<span>` animating width) + `.font-mono` `FORGING…`. When `status==='error'`, an error card (subtle ember-red border, `.font-mono` message — e.g. the "fal unavailable — set FAL_KEY" text). When idle, nothing.
  - **`Gallery.tsx` + `AssetCard.tsx`** (right): a responsive grid. Each `AssetCard` is a `.panel` with `<img src={`/api/assets/${asset.id}/raw`} />` (object-cover, sharp corners), and a `.font-mono` caption strip: truncated prompt + dimensions (`1024×1024`) + model. Cards use `.rise` with staggered `animation-delay` (index * 60ms). 
  - **`EmptyState.tsx`** — when `assets` is empty: centered, a hand-built SVG ember/anvil mark (molten gradient), a `.font-display` line "Nothing forged yet", a `.font-mono` sub "Describe something and forge it." Atmospheric, not a generic empty box.

  - **`Studio.tsx`** ('use client') — composes `useForgecast()` + `useState` for prompt/model/ratio; renders `Header`, then a 2-column layout (left `ForgePanel` ~`360–400px`, right `JobStatus` + `Gallery`/`EmptyState`). Use `.rise` with staggered delays for header → panel → gallery on load. Responsive: stack to one column under `lg`.

- [ ] **Step 3: `apps/web/app/page.tsx`** — render the studio:

```tsx
import { Studio } from '@/components/studio/Studio';

export default function Page() {
  return <Studio />;
}
```

- [ ] **Step 4:** `pnpm --filter @forgecast/web build` succeeds; `pnpm --filter @forgecast/web exec tsc --noEmit` clean; `pnpm test` still green. Commit: `feat(web): Image Studio UI (Molten Forge)`.

---

## Verification (controller, not subagent)

After the build: `preview_start` the web app, `preview_screenshot` the studio (ready/empty state + the error state when forging without a key), `preview_console_logs` for errors. Iterate on styling until it reads as a deliberate, distinctive Molten-Forge studio (not AI-slop). Share screenshots with the user.

## Definition of Done (2c-4)
- `GET /api/assets/[id]/raw` serves stored bytes; gallery `<img>` uses it.
- The Studio renders the Molten Forge aesthetic: Bricolage/IBM Plex type, warm-charcoal canvas, molten Forge button with glow, grain + ember atmosphere, model picker from `imageModels`, ratio chips, heat-bar status, gallery with empty state.
- `pnpm --filter @forgecast/web build` + `tsc` clean; `pnpm test` green.
- Atomic commits per task.

**Next:** 2d — Postgres + MinIO behind the existing interfaces + `docker-compose.yml`; wire live fal (FAL_KEY) so generations actually produce + persist images; then `docker compose up` is the install story.
