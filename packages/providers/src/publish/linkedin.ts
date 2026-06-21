import { PublishError, type Publisher, type PublishRequest, type PublishResult } from '@forgecast/core';

export interface LinkedInPublisherOptions {
  accessToken?: string;
  authorUrn?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export class LinkedInPublisher implements Publisher {
  readonly name = 'linkedin';
  private readonly accessToken: string | undefined;
  private readonly authorUrn: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: LinkedInPublisherOptions = {}) {
    this.accessToken = opts.accessToken ?? process.env.LINKEDIN_ACCESS_TOKEN;
    this.authorUrn = opts.authorUrn ?? process.env.LINKEDIN_AUTHOR_URN;
    this.baseUrl = (opts.baseUrl ?? 'https://api.linkedin.com').replace(/\/$/, '');
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  isAvailable(): boolean {
    return Boolean(this.accessToken && this.authorUrn);
  }

  async publish(req: PublishRequest): Promise<PublishResult> {
    if (!this.accessToken || !this.authorUrn) {
      throw new PublishError('unconfigured', 'LinkedIn credentials not configured (set LINKEDIN_ACCESS_TOKEN and LINKEDIN_AUTHOR_URN)');
    }

    const body: Record<string, unknown> = {
      author: this.authorUrn,
      commentary: req.content,
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED' },
      lifecycleState: 'PUBLISHED',
    };

    const res = await this.fetchFn(`${this.baseUrl}/rest/posts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'LinkedIn-Version': '202401',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(body),
    });

    const postId = res.headers.get('x-restli-id');

    const text = await res.text();
    let parsed: unknown = {};
    if (text) { try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; } }

    if (!res.ok) {
      const err = parsed as { message?: string; status?: number };
      throw new PublishError(
        `li_${err.status ?? res.status}`,
        err.message ?? `LinkedIn post failed (${res.status})`,
      );
    }

    const resolvedId = postId ?? (parsed as { id?: string }).id;
    if (!resolvedId) throw new PublishError('bad_response', 'LinkedIn response missing post id');

    return { postId: resolvedId, status: 'published', raw: parsed };
  }
}
