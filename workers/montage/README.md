# forgecast-montage-worker

Remotion-based montage render engine for Forgecast.  
The main app talks to this service via the `RemotionMontageWorker` HTTP client
(in `packages/providers/src/montage/remotion.ts`).

---

## HTTP API contract

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/render` | Accept a `MontageSpec` JSON body, start an async render, return `{ "taskId": "<id>" }` (200). |
| `GET` | `/render/:taskId` | Poll render status → `{ "state": "processing"|"complete"|"failed", "videoUrl"?: "..." }`. `videoUrl` is set only when `state === "complete"`. |
| `GET` | `/files/:taskId.mp4` | Download the finished mp4 once complete. |

### MontageSpec shape

```ts
interface MontageScene {
  url: string;                        // publicly reachable asset URL
  kind: 'image' | 'video';
  durationSec: number;
  caption?: string;
  transition?: 'fade' | 'slide' | 'none';  // default: 'fade'
}
interface MontageSpec {
  scenes: MontageScene[];
  aspectRatio: string;   // '9:16' | '16:9' | '1:1' | '4:5' | custom 'W:H'
  fps?: number;          // default 30
  voiceoverText?: string;
  musicUrl?: string;
}
```

---

## Run locally

```bash
cd workers/montage
npm install
npm run dev       # starts HTTP server on :8787
```

Tell the main app where to find the worker:

```bash
# In apps/web (or wherever the server runs)
MONTAGE_WORKER_URL=http://localhost:8787
```

The `videoUrl` values returned by the worker are absolute URLs derived from
`MONTAGE_PUBLIC_URL` (default: `http://localhost:8787`).  
If the main app and the worker run on different hosts, set `MONTAGE_PUBLIC_URL`
to the externally reachable URL of the worker so the main app can download the
finished mp4.

The worker also needs to be able to **fetch** asset URLs referenced in each
scene's `url` field. For local development these must be publicly reachable;
for production deployments point both services at the same CDN/storage origin.

### Other scripts

```bash
npm run studio    # open Remotion Studio to preview compositions
npm test          # vitest unit tests (timeline module only)
npm run typecheck # tsc --noEmit
```

---

## Docker

```bash
docker build -t forgecast-montage .
docker run -p 8787:8787 \
  -e MONTAGE_PUBLIC_URL=https://montage.example.com \
  forgecast-montage
```

> **First render note:** Remotion downloads its own headless Chromium (Thorium)
> on first use, which can take 1–2 minutes. Pre-warm the container (or your
> local install) with:
> ```bash
> npx remotion browser ensure
> ```

---

## Architecture

```
POST /render  →  validate spec  →  assign taskId  →  respond 200 { taskId }
                                         ↓ (async)
                              renderMontage(spec, out/<id>.mp4)
                                         ↓
                              Remotion bundle → selectComposition → renderMedia
                                         ↓
                              tasks.set(id, { state:'complete', videoUrl })

GET /render/:id  →  return tasks.get(id)
GET /files/:id.mp4  →  stream out/<id>.mp4
```

`src/timeline.ts` is the pure (no Remotion/React) deterministic core that maps
a `MontageSpec` to frame-level offsets. It is fully unit-tested independently
of the Remotion runtime.
