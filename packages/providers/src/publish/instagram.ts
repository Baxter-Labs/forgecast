import { PublishError, type Publisher, type PublishRequest, type PublishResult } from '@forgecast/core';

export interface InstagramPublisherOptions {
  accessToken?: string;
  igUserId?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

interface IgMediaResponse { id?: string }

function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|avi|webm)(\?|$)/i.test(url);
}

export class InstagramPublisher implements Publisher {
  readonly name = 'instagram';
  private readonly accessToken: string | undefined;
  private readonly igUserId: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: InstagramPublisherOptions = {}) {
    this.accessToken = opts.accessToken ?? process.env.INSTAGRAM_ACCESS_TOKEN;
    this.igUserId = opts.igUserId ?? process.env.INSTAGRAM_IG_USER_ID;
    this.baseUrl = (opts.baseUrl ?? `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? 'v23.0'}`).replace(/\/$/, '');
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  isAvailable(): boolean {
    return Boolean(this.accessToken && this.igUserId);
  }

  async publish(req: PublishRequest): Promise<PublishResult> {
    if (!this.accessToken || !this.igUserId) {
      throw new PublishError('unconfigured', 'Instagram credentials not configured (set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_IG_USER_ID)');
    }

    const mediaUrl = req.mediaUrls?.[0];
    if (!mediaUrl) throw new PublishError('no_media', 'Instagram requires at least one media URL');

    // Step A: create media container
    const containerParams = new URLSearchParams({
      caption: req.content,
      access_token: this.accessToken,
    });

    if (isVideoUrl(mediaUrl)) {
      containerParams.set('video_url', mediaUrl);
      containerParams.set('media_type', 'REELS');
    } else {
      containerParams.set('image_url', mediaUrl);
    }

    const containerRes = await this.fetchFn(`${this.baseUrl}/${this.igUserId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: containerParams.toString(),
    });

    const containerText = await containerRes.text();
    let containerData: unknown = {};
    if (containerText) { try { containerData = JSON.parse(containerText); } catch { containerData = { raw: containerText }; } }

    if (!containerRes.ok) {
      const err = (containerData as { error?: { message?: string; code?: number } }).error;
      throw new PublishError(
        err?.code ? `ig_${err.code}` : 'container_failed',
        err?.message ?? `Instagram container creation failed (${containerRes.status})`,
      );
    }

    const creationId = (containerData as IgMediaResponse).id;
    if (!creationId) throw new PublishError('bad_response', 'Instagram response missing container id');

    // Step B: publish the container
    const publishParams = new URLSearchParams({
      creation_id: creationId,
      access_token: this.accessToken,
    });

    const publishRes = await this.fetchFn(`${this.baseUrl}/${this.igUserId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: publishParams.toString(),
    });

    const publishText = await publishRes.text();
    let publishData: unknown = {};
    if (publishText) { try { publishData = JSON.parse(publishText); } catch { publishData = { raw: publishText }; } }

    if (!publishRes.ok) {
      const err = (publishData as { error?: { message?: string; code?: number } }).error;
      throw new PublishError(
        err?.code ? `ig_${err.code}` : 'publish_failed',
        err?.message ?? `Instagram publish failed (${publishRes.status})`,
      );
    }

    const mediaId = (publishData as IgMediaResponse).id;
    if (!mediaId) throw new PublishError('bad_response', 'Instagram publish response missing media id');

    return { postId: mediaId, status: 'published', raw: publishData };
  }
}
