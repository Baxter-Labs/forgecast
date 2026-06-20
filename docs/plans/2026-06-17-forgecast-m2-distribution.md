# Forgecast M2 — Distribution (cross-platform posting)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** "Forge it, **cast it**." Publish generated assets across social platforms through a **pluggable publisher** layer — the same provider-adapter pattern used for generation. First adapter: **omnisocials** (one integration → 10 platforms, the fast path). Native Instagram/Meta, LinkedIn, YouTube adapters come after (each gated by its own OAuth + app-approval).

**Architecture:** A `Publisher` contract in `@forgecast/core`; a `PublisherRegistry` + concrete adapters in `@forgecast/providers`; publishing exposed via an API route + MCP tool. The **omnisocials** adapter is an HTTP client (injectable fetch → fully mock-tested) against the verified contract:
- `POST https://api.omnisocials.com/v1/posts/create-and-publish` · `Authorization: Bearer <key>` · `{ content, channels?, media_urls? }` → `{ id, status }`; errors `{ error: { code, message } }`.

**Repo:** `~/Desktop/BaxterLabs/forgecast` (M1 complete: image + short-video + MCP + durable + CI + published; 74 tests).

---

## Decomposition
- **M2-1** *(detailed, TDD)* — `Publisher` contract + `PublisherRegistry` + `OmnisocialsPublisher`. Pure, mock-tested.
- **M2-2** *(outline)* — wire into the app: `services.publishers`, `POST /api/assets/[id]/publish` (resolve asset → public URL → publish), MCP tool `forgecast_publish_asset` (+ `forgecast_list_publishers`). Tests with a fake publisher.
- **M2-3** *(outline)* — native adapters (YouTube Data API, LinkedIn, Instagram Graph) as `Publisher`s taking an OAuth token; mock-tested clients + a `docs/social-setup.md` for the app-registration + OAuth marathon (can't be run-verified without approved apps + tokens).

This document fully specifies **M2-1**.

---

## M2-1: Publisher contract + registry + omnisocials adapter

**Files:**
- Create: `packages/core/src/publish.ts`; modify `packages/core/src/index.ts`
- Create: `packages/providers/src/publish/registry.ts`, `packages/providers/src/publish/omnisocials.ts`; modify `packages/providers/src/index.ts`
- Test: `packages/providers/test/omnisocials.test.ts`

- [ ] **Step 1: `packages/core/src/publish.ts`**

```ts
export interface PublishRequest {
  /** The caption / post text. */
  content: string;
  /** Target channel/platform ids (e.g. ["instagram","linkedin","youtube"]). Omit for all connected. */
  channels?: string[];
  /** Public URLs of media to attach (the publishing service must be able to fetch them). */
  mediaUrls?: string[];
}

export interface PublishResult {
  /** Provider-side post id. */
  postId: string;
  /** Provider-side status (e.g. "publishing", "published", "scheduled"). */
  status: string;
  raw?: unknown;
}

export interface Publisher {
  readonly name: string;
  isAvailable(): boolean;
  publish(req: PublishRequest): Promise<PublishResult>;
}

export class PublishError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'PublishError';
  }
}
```

- [ ] **Step 2: `packages/core/src/index.ts`** — add `export * from './publish';`.

- [ ] **Step 3: failing test `packages/providers/test/omnisocials.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { PublishError } from '@forgecast/core';
import { OmnisocialsPublisher, PublisherRegistry } from '../src/index';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('OmnisocialsPublisher', () => {
  it('is unavailable without an api key', () => {
    expect(new OmnisocialsPublisher({ apiKey: undefined }).isAvailable()).toBe(false);
  });

  it('throws PublishError when publishing without a key', async () => {
    await expect(new OmnisocialsPublisher({ apiKey: undefined }).publish({ content: 'hi' }))
      .rejects.toBeInstanceOf(PublishError);
  });

  it('creates-and-publishes with content, channels, and media urls', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ id: 'post_1', status: 'publishing' }));
    const p = new OmnisocialsPublisher({ apiKey: 'k', fetchFn });
    const r = await p.publish({ content: 'a fox', channels: ['instagram', 'linkedin'], mediaUrls: ['https://x/a.png'] });
    expect(r).toEqual({ postId: 'post_1', status: 'publishing', raw: { id: 'post_1', status: 'publishing' } });

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://api.omnisocials.com/v1/posts/create-and-publish');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer k' });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      content: 'a fox', channels: ['instagram', 'linkedin'], media_urls: ['https://x/a.png'],
    });
  });

  it('omits channels/media when not provided', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ id: 'p2', status: 'publishing' }));
    const p = new OmnisocialsPublisher({ apiKey: 'k', fetchFn });
    await p.publish({ content: 'just text' });
    expect(JSON.parse((fetchFn.mock.calls[0]![1] as RequestInit).body as string)).toEqual({ content: 'just text' });
  });

  it('maps an api error envelope to PublishError', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ error: { code: 'no_channels', message: 'no channels connected' } }, 400),
    );
    const p = new OmnisocialsPublisher({ apiKey: 'k', fetchFn });
    await expect(p.publish({ content: 'x' })).rejects.toThrowError(/no channels connected/);
  });
});

describe('PublisherRegistry', () => {
  it('registers, gets, and lists available publishers', () => {
    const reg = new PublisherRegistry();
    reg.register(new OmnisocialsPublisher({ apiKey: 'k' }));
    reg.register(new OmnisocialsPublisher({ apiKey: undefined })); // overwrites by name; unavailable
    expect(() => reg.get('omnisocials')).not.toThrow();
    expect(() => reg.get('nope')).toThrowError(/unknown publisher: nope/i);
  });
});
```

- [ ] **Step 4: `packages/providers/src/publish/registry.ts`**

```ts
import type { Publisher } from '@forgecast/core';

export class PublisherRegistry {
  private readonly publishers = new Map<string, Publisher>();

  register(publisher: Publisher): void {
    this.publishers.set(publisher.name, publisher);
  }
  get(name: string): Publisher {
    const publisher = this.publishers.get(name);
    if (!publisher) throw new Error(`Unknown publisher: ${name}`);
    return publisher;
  }
  available(): string[] {
    return [...this.publishers.values()].filter((p) => p.isAvailable()).map((p) => p.name);
  }
}
```

- [ ] **Step 5: `packages/providers/src/publish/omnisocials.ts`**

```ts
import { PublishError, type Publisher, type PublishRequest, type PublishResult } from '@forgecast/core';

export interface OmnisocialsPublisherOptions {
  /** Defaults to process.env.OMNISOCIALS_API_KEY. */
  apiKey?: string;
  /** Defaults to https://api.omnisocials.com/v1. */
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

interface OmniError { error?: { code?: string; message?: string } }
interface OmniPost { id?: string; status?: string }

export class OmnisocialsPublisher implements Publisher {
  readonly name = 'omnisocials';
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: OmnisocialsPublisherOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.OMNISOCIALS_API_KEY;
    this.baseUrl = (opts.baseUrl ?? 'https://api.omnisocials.com/v1').replace(/\/$/, '');
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async publish(req: PublishRequest): Promise<PublishResult> {
    if (!this.apiKey) throw new PublishError('unconfigured', 'OmniSocials API key not configured (set OMNISOCIALS_API_KEY)');

    const body: Record<string, unknown> = { content: req.content };
    if (req.channels && req.channels.length > 0) body.channels = req.channels;
    if (req.mediaUrls && req.mediaUrls.length > 0) body.media_urls = req.mediaUrls;

    const res = await this.fetchFn(`${this.baseUrl}/posts/create-and-publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let parsed: unknown = {};
    if (text) { try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; } }

    const err = (parsed as OmniError).error;
    if (!res.ok || err) {
      throw new PublishError(err?.code ?? 'api_error', err?.message ?? `publish failed with status ${res.status}`);
    }

    const post = parsed as OmniPost;
    if (!post.id) throw new PublishError('bad_response', 'OmniSocials response missing post id');
    return { postId: post.id, status: post.status ?? 'unknown', raw: parsed };
  }
}
```

- [ ] **Step 6: `packages/providers/src/index.ts`** — add `export * from './publish/registry';` and `export * from './publish/omnisocials';`.

- [ ] **Step 7:** run the test (PASS, 6), full `pnpm test`, `pnpm typecheck` clean. Commit: `feat(providers): Publisher contract + registry + omnisocials adapter`.

---

## M2-2 (outline — wire into the app)
- `buildServices`: construct a `PublisherRegistry`, register `new OmnisocialsPublisher()` (+ native publishers when configured); expose `publishers` on `Services`.
- `lib/api.ts`: `publishAsset(services, assetId, input)` — resolve the asset (404 if missing); require an available publisher (503 if none); build the media URL from `FORGECAST_BASE_URL + /api/assets/:id/raw` (note: the publishing service must be able to reach it — document the public-URL / Cloudflare-Tunnel requirement); call `registry.get(publisher).publish({ content, channels, mediaUrls:[url] })`; return the result.
- Route `POST /api/assets/[id]/publish` `{ content, channels?, publisher? }`.
- MCP: `forgecast_publish_asset` (project/asset → platforms) + `forgecast_list_publishers`.
- Tests with a fake publisher injected via the registry.

## M2-3 (outline — native adapters)
- `@forgecast/providers` native `Publisher`s: `YouTubePublisher` (YouTube Data API v3 `videos.insert`), `LinkedInPublisher` (`/ugcPosts` or `/rest/posts`), `InstagramPublisher` (Instagram Graph `media` + `media_publish`). Each takes an OAuth access token (env per platform), mock-tested.
- `docs/social-setup.md`: per-platform app registration, OAuth scopes (`youtube.upload`, `w_member_social`, `instagram_content_publish`), and the review/approval requirements. These can't be run-verified without approved apps + tokens.

---

## Definition of Done (M2-1)
- `@forgecast/core` exports the `Publisher`/`PublishRequest`/`PublishResult` contract + `PublishError`.
- `@forgecast/providers` exports `PublisherRegistry` + `OmnisocialsPublisher` (HTTP client, mock-tested: success, unconfigured, api-error, payload shape).
- Full `pnpm test` green; `pnpm typecheck` clean.
- Atomic commit.

**Next:** M2-2 (publish API + MCP tool), then M2-3 (native IG/LinkedIn/YouTube adapters + OAuth setup docs).
