import { PublishError, type Publisher, type PublishRequest, type PublishResult } from '@forgecast/core';

export interface OmnisocialsPublisherOptions {
  apiKey?: string;
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
