# Forgecast — Roadmap & Engineering Handoff

This is the working handoff for continuing Forgecast. It's written to be actionable by
an autonomous coding agent (e.g. Devin) or a human: it says **what's done, what's next,
exactly where each new capability slots in, which models to use, and how to verify.**

_Last updated: 2026-07-18._

---

## 1. Where the project is

Forgecast is **live** on Cloudflare Workers (`forgecast-web.eshwarpk.workers.dev`) with a
Remotion montage worker on Fly.io (`forgecast-montage`). Repo: **`Baxter-Labs/forgecast`**
(public, MIT). Suite: **~609 tests**, strict TypeScript, every PR green.

**Recently shipped — competitor-parity wave (vs Higgsfield / LTX Studio / OpenArt):**

| Feature | What it does | PR |
|---|---|---|
| **Characters (cast)** | Create a persistent identity from 1–4 photos; reuse it across image, video (i2v), and the talking presenter — identity stays consistent. Owner-scoped, reusable across projects. | #98, #99 |
| **Storyboard / Director** | Brief → LLM shot list → identity-consistent frame per shot (starring your cast) → animate → assemble into the timeline as a film with voiceover. | #100 |
| **Re-angle & Re-light** | One-click camera re-angling (Qwen-Image-Edit-2509) and scene relighting (IC-Light v2) preset chips in the asset editor. | #101 |
| **Cinema preset rack** | SHOT / LENS / MOVEMENT / LOOK prompt-preset chips for video (works on every provider incl. free). | _in progress → `feat/cinema-rack`_ |
| **UI/UX + a11y polish** | WCAG contrast, focus, modal a11y, z-index scale, tap targets — no rebrand. | #102 (open) |
| **Integrations hardening** | BYO-key LLM threading, provider API-version bumps, env docs. | #103 (open) |

**Hosted MCP surface: 34 tools** (create/edit/cast/direct the whole pipeline from
Claude/ChatGPT). See `apps/web/lib/mcp.ts`.

---

## 2. How to add a capability — the 8 seams

Every feature touches these files in this order. This is the single most useful thing to
know; the codebase is a clean hexagonal architecture (vendor-neutral contracts → adapters
→ handlers → wiring → ops → routes → UI).

1. **Contract** — declare the interface in `packages/core/src/<name>.ts`, export from the
   barrel `packages/core/src/index.ts`. _(e.g. `character.ts`, `reimagine.ts`.)_
2. **Adapter** — implement it in `packages/providers/src/<domain>/<vendor>.ts`, export from
   `packages/providers/src/index.ts`.
3. **JobKind** (only if it produces an asset async) — add to the `JobKind` union in
   `packages/core/src/types.ts`, write a handler in `packages/jobs/src/handlers/<x>.ts`
   implementing `JobHandler { readonly kind; run(job, report): Promise<JobOutcome> }`,
   export from `packages/jobs/src/index.ts`.
4. **Registration** — instantiate the provider + push the handler into the `handlers[]`
   array in `buildServices()` (`apps/web/lib/forgecast.ts`); add any availability flag to
   the `Services` interface + returned object; thread per-user overrides in
   `getServicesForUser()`.
5. **Op** — export an `async function(services, projectId, input): Promise<ApiResult>` in
   `apps/web/lib/api.ts`.
6. **Route** — add a thin wrapper under `apps/web/app/api/…/route.ts` (copy an existing one:
   `requireProject`/`requireUser` → `getServicesForUser` → call the op).
7. **UI** — a `ForgeMode` segment or chips in `apps/web/components/studio/ForgePanel.tsx`,
   a rail button in `apps/web/components/editor/AssetEditor.tsx`, or a modal
   (pattern: `BrandKitModal.tsx` / `CharacterModal.tsx`). Wire state/fetch into
   `apps/web/lib/use-forgecast.ts`.
8. **BYO key** — add a `KeyId` to `KEY_CATALOG` in `apps/web/lib/keys.ts` and map it in
   `getServicesForUser()`.
9. **Hosted MCP** — append a tool to `TOOLS` in `apps/web/lib/mcp.ts` (conventions:
   `obj()`/`str()`/`unwrap()`, `ownedProjectId`/`ownedAsset` guards, forward **only declared
   fields**, concise projections, actionable errors).

**Persistence notes:** `Asset.params` is freeform JSON (D1 TEXT column) — attach new
metadata (`characterId`, tags, `op`/`preset` provenance) with **zero schema change**. A new
collection = the repo pattern in `packages/store/src/d1/characterRepo.ts` (mirror it for
d1 + sqlite + memory, add a `CREATE TABLE` to `D1_SCHEMA` in `packages/store/src/d1/db.ts`
and the sqlite schema, wire into both `store.ts` + the barrel).

---

## 3. Verification gates (run before every PR)

```bash
pnpm typecheck        # tsc --noEmit across the monorepo — 0 errors
pnpm test             # vitest — keep it green (add tests mirroring apps/web/test/*)
cd apps/web && pnpm build   # OpenNext/Next build must compile
```

**PR workflow:** the repo is public, so the auto-guard **blocks self-merge**. Branch →
push → open a PR → a human merges. When a change alters the montage `MontageSpec`,
**deploy the Fly worker first** (`cd workers/montage && fly deploy`) **then** the web app
(`cd apps/web && pnpm cf:deploy`) — spec fields are additive-optional so old/new interop.

---

## 4. Next up (priority order)

### PR F — Cinema preset rack _(in progress → `feat/cinema-rack`)_
SHOT / LENS / MOVEMENT / LOOK prompt-modifier chips folded into the video prompt. Universal
(works on every provider including the free HF-Spaces path). May already be an open PR by
the time you read this — check first.

### PR G — Library + Brainstorm
- **Global library**: add `listByOwner(ownerId)` to `AssetRepo` (`packages/core/src/repos.ts`
  + all three repo impls), a **tags/collection** field on `Asset.params` (no schema change),
  filter/search UI in `apps/web/components/studio/Gallery.tsx`, and a global
  `apps/web/app/library/` route (cross-project). This is OpenArt/Higgsfield's "Library".
- **Brainstorm boards**: persist the tool-calling agent's PLAN output
  (`packages/agent/src/plan.ts` → `ContentPlan`) as revisitable idea boards (storage JSON,
  like `storyboard.json`); a board UI to pick an idea → generate. Turns today's chat-only
  ideation into a real surface.

### PR H — Character LoRA training ("Soul-ID" trained-identity tier)
The differentiator vs reference-conditioning: a **trained** identity that holds under big
scene/pose/lighting changes (Higgsfield Soul ID / OpenArt custom training).
- Extend `Character` (`packages/core/src/character.ts`) with optional `loraUrl` + `loraStatus`.
- New `lora-train` JobKind + handler calling **`fal-ai/flux-lora-fast-training`** (8–32
  images → a LoRA in ~5–15 min). Store the resulting LoRA URL on the character.
- In `generateImage`/`generateVideo`, when a character has a trained LoRA, load it on the
  fal request instead of (or alongside) reference images.
- UI: a "Train" action + status in `CharacterModal.tsx`.

### Backlog (OpenArt-gap analysis, ranked by user value)
1. **Lip-sync onto existing footage** — `fal-ai/sync-lipsync`, `fal-ai/latentsync` (open-source, cheap; free self-host path).
2. **Motion retarget** (drive a character's performance from a reference video) — `fal-ai/wan-animate`.
3. **SFX for video** — `fal-ai/mmaudio-v2`; **music beds** — Suno / Lyria.
4. **Video-to-video restyle** — Wan v2v.
5. **Video upscale** — `fal-ai/clarity-upscaler`, SeedVR2.

---

## 5. Model reference (verified July 2026)

Tiered strategy: **free path where one exists, fal on top for premium quality.** Keep this.

| Capability | Best (BYO fal) | Free / self-host path |
|---|---|---|
| Consistent character (image) | `fal-ai/nano-banana-pro`, `fal-ai/nano-banana/edit` | `fal-ai/flux-kontext/dev` (open weights); PuLID/InstantID/PhotoMaker (OSS) |
| Character in video (i2v) | `fal-ai/kling-video/v2.6/pro/image-to-video`; Kling 2.5 Turbo | Wan i2v (open weights, self-host) |
| Talking avatar | `fal-ai/bytedance/omnihuman(/v1.5)` (already wired); `kling-video/ai-avatar/v2` | LatentSync / MuseTalk (OSS) |
| Re-light | `fal-ai/iclight-v2` _(shipped)_ | `lllyasviel/IC-Light` self-host |
| Re-angle (still) | `fal-ai/qwen-image-edit-2509` _(shipped — the base model is prompt-driven; the `…/multiple-angles` LoRA has NO prompt field, do not use it for instruction presets)_ | Qwen-Image-Edit-2509 + angle LoRA, self-host |
| Camera move (video) | `bytedance/seedance-2.0/image-to-video` (native camera control) | Wan camera LoRAs / ReCamMaster (self-host) |
| LoRA training | `fal-ai/flux-lora-fast-training` | Kohya / ai-toolkit self-host |
| Storyboard | LLM shot-plan + per-shot consistent gen _(shipped)_ | same, with a free/local LLM (Ollama) |

**Free defaults (never regress these):** keyless image (CF FLUX schnell) · keyless voice
(CF MeloTTS) · free video (HF ZeroGPU Spaces with a free HF token) · stills-reel montage
(Remotion, unlimited). Edit-capable features (characters/relight/reangle) need a fal key —
keyless users must get an **actionable 503** telling them to add one, never a silent
failure. See `docs/SELF-HOST-FREE.md`.

---

## 6. Known deferred items / tech debt

- **Per-user Pro billing is a global in-memory flag** (`apps/web/lib/billing/entitlements.ts`):
  one Mollie payment flips Pro for *everyone* and resets per Worker isolate. **Fix before
  charging money:** recover `userId` from the payment metadata, persist entitlement to D1
  (mirror the `characters`/`user_keys` repo pattern). HIGH priority.
- **HF ZeroGPU Space drift** (`packages/providers/src/video/hfspaces.ts`): community Spaces
  redeploy without notice. Periodically re-verify the hardcoded fn signatures against
  `https://<space>.hf.space/gradio_api/info`; keep 2–3 fallbacks + the stills-reel path.
- **Provider API versions sunset** (Google Ads / Meta Graph / LinkedIn): defaults are now
  env-overridable (`GOOGLE_ADS_API_VERSION`, `META_GRAPH_VERSION`, `LINKEDIN_VERSION`) — bump
  them ~yearly.
- **`waitlist` / marketing-site items** are tracked separately (not in this repo).

---

## 7. Notes for the coding agent (Devin)

- **One PR per feature.** Follow the 8 seams in §2; keep diffs idiomatic to the surrounding
  code (match comment density, naming, the mono/uppercase/ember UI style).
- **Preserve the free tier** (§5). New premium features are additive on top of a fal/HF key,
  never a regression of the keyless defaults.
- **Test like the repo does** — see `apps/web/test/*` and `packages/*/test/*`; mock the LLM
  the way `ad-copy`/`storyboard` tests do; assert provider request shapes via a fetch mock.
- **Run the three gates** (§3) before opening any PR; **do not self-merge** (auto-guard).
- **Security conventions** already in place — copy them: ownership guards on every
  project/asset/character path, forward-only-declared-fields in MCP tools, `guardText` on
  every user prompt/brief/script, https-only for server-side fetches on the hosted MCP.
- The competitor research + feature analysis that drove this roadmap lives in the team's
  planning notes; the short version: match **Higgsfield** (avatars, cinema, storyboards),
  **LTX Studio** (storyboard→film, elements/library), **OpenArt** (LoRA training, one-click
  story, editing on uploaded footage) — while staying **open-source, self-hostable, and
  free-by-default**, which none of them are.
