import { PublishError, type Publisher, type PublishRequest, type PublishResult } from '@forgecast/core';

export interface YouTubePublisherOptions {
  accessToken?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

interface YouTubeVideoResponse { id?: string }

function deriveTitle(content: string): string {
  const firstLine = content.split('\n')[0] ?? content;
  return firstLine.slice(0, 70).trim() || 'Forgecast Upload';
}

export class YouTubePublisher implements Publisher {
  readonly name = 'youtube';
  private readonly accessToken: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: YouTubePublisherOptions = {}) {
    this.accessToken = opts.accessToken ?? process.env.YOUTUBE_ACCESS_TOKEN;
    this.baseUrl = (opts.baseUrl ?? 'https://www.googleapis.com').replace(/\/$/, '');
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  isAvailable(): boolean {
    return Boolean(this.accessToken);
  }

  async publish(req: PublishRequest): Promise<PublishResult> {
    if (!this.accessToken) {
      throw new PublishError('unconfigured', 'YouTube credentials not configured (set YOUTUBE_ACCESS_TOKEN)');
    }

    const mediaUrl = req.mediaUrls?.[0];
    if (!mediaUrl) throw new PublishError('no_media', 'YouTube requires a video URL to upload');

    // Step 1: fetch the video bytes from the media URL
    const mediaRes = await this.fetchFn(mediaUrl);
    if (!mediaRes.ok) throw new PublishError('media_fetch_failed', `Failed to fetch media from ${mediaUrl} (${mediaRes.status})`);
    const mediaBytes = new Uint8Array(await mediaRes.arrayBuffer());

    // Step 2: initiate resumable upload with metadata
    const title = deriveTitle(req.content);
    const metadata = {
      snippet: { title, description: req.content },
      status: { privacyStatus: 'unlisted', selfDeclaredMadeForKids: false },
    };

    const initRes = await this.fetchFn(
      `${this.baseUrl}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': 'video/*',
          'X-Upload-Content-Length': String(mediaBytes.length),
        },
        body: JSON.stringify(metadata),
      },
    );

    if (!initRes.ok) {
      const text = await initRes.text();
      let msg = `YouTube upload init failed (${initRes.status})`;
      try { const e = JSON.parse(text) as { error?: { message?: string } }; if (e.error?.message) msg = e.error.message; } catch {}
      throw new PublishError('upload_init_failed', msg);
    }

    const uploadUrl = initRes.headers.get('location');
    if (!uploadUrl) throw new PublishError('bad_response', 'YouTube upload init response missing location header');

    // Step 3: upload the video bytes to the resumable URL
    const uploadRes = await this.fetchFn(uploadUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'video/*',
        'Content-Length': String(mediaBytes.length),
      },
      body: mediaBytes,
    });

    const uploadText = await uploadRes.text();
    let uploadData: unknown = {};
    if (uploadText) { try { uploadData = JSON.parse(uploadText); } catch { uploadData = { raw: uploadText }; } }

    if (!uploadRes.ok) {
      const err = (uploadData as { error?: { message?: string } }).error;
      throw new PublishError('upload_failed', err?.message ?? `YouTube upload failed (${uploadRes.status})`);
    }

    const videoId = (uploadData as YouTubeVideoResponse).id;
    if (!videoId) throw new PublishError('bad_response', 'YouTube upload response missing video id');

    return { postId: videoId, status: 'uploaded', raw: uploadData };
  }
}
