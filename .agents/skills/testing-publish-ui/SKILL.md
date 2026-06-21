---
name: testing-forgecast-publish-ui
description: Test the Forgecast Studio publish UI end-to-end. Use when verifying PublishPanel, Cast button, or publisher adapter changes.
---

# Testing Forgecast Studio Publish UI

## Prerequisites

- Node.js v22+ (required for `node:sqlite` built-in module)
- The repo cloned at the expected location

## Devin Secrets Needed

- `OMNISOCIALS_API_KEY` — needed to make the omnisocials publisher available. For testing error handling, a dummy value like `test_dummy_key` works. For testing success path, a real key is required.
- `FAL_KEY` — needed only if testing image generation; not required for publish UI testing alone.

## Environment Setup

1. **Start dev server with experimental sqlite flag:**
   ```bash
   cd /home/ubuntu/repos/forgecast
   NODE_OPTIONS="--experimental-sqlite" OMNISOCIALS_API_KEY=test_dummy_key npx next dev -p 3210
   ```
   The `--experimental-sqlite` flag is mandatory — without it, the `node:sqlite` module fails to load and all API routes return 500.

2. **Verify health endpoint:**
   ```bash
   curl -s http://localhost:3210/api/health | jq .
   ```
   Confirm `publishers` array is non-empty (should contain `"omnisocials"` with the dummy key).

3. **Seed a test asset** (if no assets exist in Gallery):
   Create a temporary route at `apps/web/app/api/test-seed/route.ts` that inserts a dummy asset with a tiny PNG into the in-memory store. This avoids needing `FAL_KEY` for image generation.
   
   After creating the route:
   ```bash
   curl -s -X POST http://localhost:3210/api/test-seed | jq .
   ```
   The seeded asset will appear in the Gallery tab with a Cast button.

## Test Procedure

### What to Test

The PublishPanel has a state machine: `draft → confirm → publishing → success/error`

1. **Cast button** — visible on asset cards in Gallery tab
2. **Panel opens** — inline panel (not modal), shows asset preview, pre-filled caption from prompt, platform chips (Instagram/LinkedIn/YouTube/Twitter-X/TikTok), Publish button
3. **Platform selection** — chips toggle on/off with visual highlight (orange border), multi-select works
4. **Caption editing** — textarea is editable, accepts custom text
5. **Confirm step** — shows summary text with selected platforms and publisher name, Edit and Confirm Post buttons
6. **Edit button** — returns to draft preserving caption and platform selections
7. **Error handling** — with dummy API key, Confirm Post shows error state with red border, error message, and Try Again button
8. **Try Again** — returns to draft preserving state
9. **Close button** — X button dismisses panel entirely, Gallery visible again

### Testing Tips

- The PublishPanel appears **below** the Gallery, so you may need to scroll down after clicking Cast.
- Platform chips highlight with `var(--ember-2)` border when selected — look for orange border vs grey.
- In confirm state, the caption textarea and platform chips become `disabled` (read-only).
- The Confirm Post button has a gradient background (molten/gold color).
- With a dummy API key, the OmniSocials API returns "Invalid or expired API key" — this is the expected error.
- The success state (showing post ID) can only be tested with a valid API key.

### Port Conflicts

If port 3210 is in use from a previous session:
```bash
pkill -f "next dev"
# or
lsof -ti:3210 | xargs kill
```

## What Changed (for context)

- `AssetCard.tsx` — added `onPublish` prop and Cast button in footer
- `PublishPanel.tsx` — new component with full state machine
- `Studio.tsx` — wires PublishPanel to Gallery via `publishingAsset` state
- `use-forgecast.ts` — added `publishers` state and `publishAsset` callback
- `packages/providers/src/publish/` — Instagram, LinkedIn, YouTube adapter files
