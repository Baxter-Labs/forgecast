# Devin Task — Native Social Publisher Adapters (Forgecast M2-3)

> **Paste this whole file as the task for a Devin session.** It is self-contained — Devin has no prior context about Forgecast. Goal: implement native **YouTube**, **LinkedIn**, and **Instagram** publisher adapters that satisfy Forgecast's existing `Publisher` contract, mock-tested, and wire them in. Devin's commits land in this repo (that is the point — this is the "Best Build with Devin" track entry).

## Repo & how to run

- Repo: `github.com/eshwarpk/forgecast` (pnpm + TypeScript monorepo, Node ≥ 20, pnpm 11).
- Install: `pnpm install`. Test: `pnpm test` (vitest). Typecheck: `pnpm -r exec tsc --noEmit`. Both must stay green.
- Strict TS is on (`strict` + `noUncheckedIndexedAccess`). **Gotcha:** when mocking `fetch` with vitest, type the impl params so `mock.calls[0]` destructuring compiles, e.g. `vi.fn(async (..._args: Parameters<typeof fetch>) => json(...))`. The existing tests use this pattern — copy it.
- Conventional commits. Work on a branch `feat/native-publishers` and open a PR into `main`.

## The contract you must implement (do NOT change it)

`packages/core/src/publish.ts`:

```ts
export interface PublishRequest { content: string; channels?: string[]; mediaUrls?: string[]; }
export interface PublishResult { postId: string; status: string; raw?: unknown; }
export interface Publisher { readonly name: string; isAvailable(): boolean; publish(req: PublishRequest): Promise<PublishResult>; }
export class PublishError extends Error { constructor(public readonly code: string, message: string) { /* ... */ } }
```

## Reference implementation to mirror EXACTLY in shape

- `packages/providers/src/publish/omnisocials.ts` — an HTTP `Publisher` with an injectable `fetchFn` (defaults to `fetch`), `isAvailable()` keyed on an env credential, error-envelope → `PublishError`, returns `{ postId, status, raw }`.
- `packages/providers/test/omnisocials.test.ts` — the test style: a `json(body,status)` helper, mocked `fetchFn`, cases for **success**, **unconfigured (no key) → `isAvailable()` false + `publish` rejects with `PublishError`**, **api-error envelope → `PublishError`**, and **payload shape** (assert the exact URL, method, headers, and JSON body sent).
- `packages/providers/src/publish/registry.ts` — `PublisherRegistry` (`register`/`get`/`available`).

Each new adapter is its own file in `packages/providers/src/publish/`, exported from `packages/providers/src/index.ts`, with a sibling test in `packages/providers/test/`.

## Adapters to build

Each constructor takes `{ accessToken?, ...ids, baseUrl?, fetchFn? }`, defaulting credentials from env. `isAvailable()` returns true only when its required credentials are present. All HTTP via the injectable `fetchFn`. Map non-2xx / error bodies to `PublishError(code, message)`.

### 1. `InstagramPublisher` (name: `"instagram"`) — easiest, URL-native
Instagram Graph API, two-step container flow (Bearer = a Page/IG access token):
- Step A — create container: `POST https://graph.facebook.com/v21.0/{ig_user_id}/media` with `{ image_url | video_url, caption, access_token }`. For `mediaUrls[0]`: use `image_url` for images, `video_url` (+ `media_type=REELS` for video) — decide by file extension; default to `image_url`. → `{ id: <creation_id> }`.
- Step B — publish: `POST https://graph.facebook.com/v21.0/{ig_user_id}/media_publish` with `{ creation_id, access_token }` → `{ id: <media_id> }`. Return `{ postId: media_id, status: 'published' }`.
- Env: `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_IG_USER_ID`. `isAvailable()` requires both.

### 2. `LinkedInPublisher` (name: `"linkedin"`)
LinkedIn Posts API (Bearer = a member/org token):
- `POST https://api.linkedin.com/rest/posts` with headers `Authorization: Bearer <token>`, `LinkedIn-Version: 202401`, `X-Restli-Protocol-Version: 2.0.0`, body `{ author: <authorUrn>, commentary: content, visibility: 'PUBLIC', distribution: { feedDistribution: 'MAIN_FEED' }, lifecycleState: 'PUBLISHED' }`. The created post id comes back in the `x-restli-id` response header (or body `id`). Return `{ postId, status: 'published' }`.
- Media: full image/video upload on LinkedIn is a multi-step register→upload→attach flow. For this adapter, implement **text posts** cleanly; if `mediaUrls` is present, accept an already-registered asset URN passed via an optional `assetUrn` option and attach it as `content.media`. Document the full upload flow in `social-setup.md` as a follow-up rather than implementing the binary upload now.
- Env: `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_AUTHOR_URN` (e.g. `urn:li:person:xxxx` or `urn:li:organization:xxxx`). `isAvailable()` requires both.

### 3. `YouTubePublisher` (name: `"youtube"`)
YouTube Data API v3 `videos.insert` (Bearer = an OAuth access token with `youtube.upload`):
- Video upload requires the **bytes**, not a URL: fetch `mediaUrls[0]` to get the media, then upload. Implement the resumable-upload flow against `https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`: (1) `POST` the metadata `{ snippet: { title, description: content }, status: { privacyStatus: 'unlisted' } }` → read the `location` upload URL from the response header; (2) `PUT` the fetched bytes to that location → `{ id: <video_id> }`. Title = first line of `content` (truncate ~70 chars). Return `{ postId: video_id, status: 'uploaded' }`.
- Env: `YOUTUBE_ACCESS_TOKEN`. `isAvailable()` requires it. (If `mediaUrls` is empty, reject with `PublishError('no_media', ...)` — YouTube needs a video.)
- Mock-test the two-call flow with an injectable `fetchFn` (first call returns a `location` header, second returns `{ id }`).

## Wiring (so the adapters are actually usable)

In `apps/web/lib/forgecast.ts` `buildServices`, after `publishers.register(new OmnisocialsPublisher(...))`, register each native publisher (they self-gate via `isAvailable()`, so registering unconditionally is fine — pass `{ fetchFn: opts.fetchFn }`):

```ts
publishers.register(new InstagramPublisher({ fetchFn: opts.fetchFn }));
publishers.register(new LinkedInPublisher({ fetchFn: opts.fetchFn }));
publishers.register(new YouTubePublisher({ fetchFn: opts.fetchFn }));
```

Add the new env vars to `.env.example` with comments. Do NOT commit any real tokens.

## Also deliver: `docs/social-setup.md`

Per-platform, concise: the app/registration you need, the OAuth scopes (`youtube.upload`; LinkedIn `w_member_social` / `w_organization_social`; Instagram `instagram_content_publish` + `pages_read_engagement` + a connected IG Business account), how to obtain the access token, and the app-review/approval each platform requires before posting to real accounts. State plainly what is run-verifiable now (mock tests) vs. what needs an approved app + token.

## Definition of done

- 3 adapters + 3 tests in `packages/providers`, exported from the providers index, registered in `buildServices`, `.env.example` updated, `docs/social-setup.md` written.
- `pnpm test` and `pnpm -r exec tsc --noEmit` both green.
- Atomic conventional commits on `feat/native-publishers`; open a PR into `main` titled `feat(providers): native YouTube/LinkedIn/Instagram publishers`.
