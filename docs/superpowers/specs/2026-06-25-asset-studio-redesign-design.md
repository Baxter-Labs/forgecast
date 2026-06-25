# Asset Studio Redesign — Design Spec

**Date:** 2026-06-25
**Status:** approved (user approved "build all 3" via brainstorming)

## Goal

Make Forgecast's creative loop world-class and complete on three axes the user called out:

1. **Create by idea** stays first-class — the prompt → image/video flow is the default entry.
2. **Create from a website URL** — paste a URL and get assets: import the real product
   images found on the site **and** generate on-brand AI images grounded in the site, then
   **enhance** them.
3. **Editing lives on its own page** — a dedicated, polished `/edit/[id]` workspace instead of
   cramped inline card buttons.

Keep the existing **Molten Forge** identity (Bricolage Grotesque + IBM Plex; `--forge-*`,
`--ember-*`, `--molten`). Elevate to a "world-best" bar: SVG (Lucide) icons instead of emoji,
visible focus states, `prefers-reduced-motion`, responsive 375/768/1024/1440, shimmer loaders,
before/after compare.

## Architecture

Today the whole Studio is one client page (`app/page.tsx` → `<Studio>`) backed by one large
`useForgecast` hook. We introduce real App-Router routes and an isolated editor data layer.

- **`GET /api/assets/[id]`** (new) — returns a single asset's metadata incl. `projectId`
  (`AssetRepo.get(id)` already exists). Lets the editor stand alone.
- **`useAssetEditor(assetId)`** (new, isolated hook) — loads that asset and drives the per-asset
  ops by calling the existing routes (`enhance`/`edit`/`cutout`/animate via `generate-clip`/
  `narrate`/new `variations`) using the asset's own `projectId`. Decoupled from the gallery hook.
- **`app/edit/[id]/page.tsx`** (new route) — the editor.

**Editor data-layer choice:** a real route + dedicated hook (vs. reusing the big Studio hook).
More code, but isolated, independently testable, and the URL is shareable — the right call for a
"well-usable separate page".

## Components / Flows

### Editor page `/edit/[id]`
- Left: large preview; image ops show a **before/after** compare; shimmer loader while a job runs.
- Right rail (Lucide icons): Enhance · Edit (prompt) · Remove background · Animate→video ·
  **Variations ×3** (new) · Narrate (video only) · Download.
- Each op creates a new asset; a **lineage** strip opens the result (`/edit/[newId]`) or the source.
- Gallery cards: drop the inline op buttons → a single **Edit** action (Download + Cast remain).

### Unified Create surface (idea first)
One panel, segmented source switcher: **From Idea** (default; existing prompt→image/video/montage)
· **From Website** (URL) · **Upload** (file).

### From Website backend — `POST /api/projects/[id]/from-website`
`{ url, generate?=true, generateCount?=2, enhance?=true }`:
1. Read the site (existing `HttpWebsiteReader` → brand/desc/images).
2. **Import** ≤6 real product images as assets (`provider: 'web-import'`, `params.sourceUrl`).
3. **Generate** `generateCount` on-brand images grounded in the site copy (provider `fal`).
4. **Enhance** the imported images when `enhance` (often low-res; satisfies "those are enhanced
   too"). Generated images skip (already crisp).
5. Return the created assets.

Bounded for serverless: ≤6 imports, ≤2 generations; each step reuses existing synchronous paths.

### Variations op (new, used in editor)
Generate 3 alternates of an image by re-running the edit model (flux-kontext) with variation
instructions. Thin layer over the existing edit job.

## Error handling
- `GET /api/assets/[id]`: 404 when absent.
- Editor: per-op error surfaced inline (reuse the hook's status/error pattern); ops disabled while
  running and when the relevant provider is unavailable (mirrors current availability gating).
- From Website: 400 on missing/invalid URL (reuse the reader's SSRF guard); 503 when fal absent for
  the generate/enhance steps (import still works); partial success returns whatever was created.

## Testing
- `GET /api/assets/[id]` route via the api layer (getAssetBytes-style helper or a `getAsset` api fn).
- `variations` api: count guard, returns N edit-provider assets, data-URI passthrough.
- `from-website` api: imports site images as assets, generates N, enhances imported, 400 on bad URL
  (all with injected fetch + a stub website reader).
- Keep the full suite green; strict typecheck; production build.

## Shipping (branch → PR → CI-green → merge)
- **PR-K1:** editor route + `GET /api/assets/[id]` + `useAssetEditor` + Variations + slim cards.
- **PR-K2:** From Website flow + unified Create surface.
- **PR-K3:** UX polish (Lucide icons, focus/reduced-motion/responsive, loaders, compare).

## Out of scope (YAGNI)
- A manual creative canvas (layers, crop, text/sticker overlays) — explicitly deferred.
- Multi-project switching in the editor (single active project assumption stays).
