import { PublishError, type Publisher, type PublishRequest, type PublishResult } from '@forgecast/core';

export interface WebhookPublisherOptions {
  /** Target URL. Falls back to WEBHOOK_PUBLISH_URL. */
  url?: string;
  /** Optional bearer secret. Falls back to WEBHOOK_PUBLISH_SECRET. */
  secret?: string;
  fetchFn?: typeof fetch;
}

interface WebhookResponse { id?: string; postId?: string; status?: string }

/**
 * A concrete, verifiable publisher that cross-posts to any HTTP endpoint — a Zapier
 * / Make / n8n webhook, a Slack/Discord incoming webhook, or your own backend. It
 * POSTs the post (content + channels + media URLs) as JSON, so you can route a single
 * Forgecast post to wherever you publish from, and actually see it land.
 *
 * Configure with WEBHOOK_PUBLISH_URL (and optionally WEBHOOK_PUBLISH_SECRET, sent as a
 * Bearer token). Unlike the social adapters it needs no per-network OAuth.
 */
export class WebhookPublisher implements Publisher {
  readonly name = 'webhook';
  private readonly url: string | undefined;
  private readonly secret: string | undefined;
  private readonly fetchFn: typeof fetch;

  constructor(opts: WebhookPublisherOptions = {}) {
    this.url = opts.url ?? process.env.WEBHOOK_PUBLISH_URL;
    this.secret = opts.secret ?? process.env.WEBHOOK_PUBLISH_SECRET;
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  isAvailable(): boolean {
    return Boolean(this.url);
  }

  async publish(req: PublishRequest): Promise<PublishResult> {
    if (!this.url) throw new PublishError('unconfigured', 'Webhook publisher not configured (set WEBHOOK_PUBLISH_URL)');

    const payload: Record<string, unknown> = { source: 'forgecast', content: req.content };
    if (req.channels && req.channels.length > 0) payload.channels = req.channels;
    if (req.mediaUrls && req.mediaUrls.length > 0) payload.mediaUrls = req.mediaUrls;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.secret) headers.Authorization = `Bearer ${this.secret}`;

    const res = await this.fetchFn(this.url, { method: 'POST', headers, body: JSON.stringify(payload) });
    const text = await res.text();
    let parsed: unknown = {};
    if (text) { try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; } }

    if (!res.ok) {
      throw new PublishError('webhook_error', `webhook publish failed with status ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
    }

    // Surface a downstream id/status when the endpoint returns one; otherwise the
    // delivery itself is the success signal.
    const r = parsed as WebhookResponse;
    const postId = r.id ?? r.postId ?? res.headers.get('x-request-id') ?? 'webhook-delivered';
    return { postId, status: r.status ?? 'delivered', raw: parsed };
  }
}
