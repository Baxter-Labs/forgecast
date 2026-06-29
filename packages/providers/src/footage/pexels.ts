import type { FootageProvider, FootageSearchInput, FootageClip } from '@forgecast/core';

export interface PexelsFootageOptions {
  apiKey?: string;
  /** Base URL for the Pexels Videos API. Falls back to the public endpoint. */
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

interface PexelsVideoFile { quality?: string; file_type?: string; width?: number; height?: number; link?: string }
interface PexelsVideo {
  id?: number | string;
  width?: number;
  height?: number;
  duration?: number;
  url?: string;
  image?: string;
  user?: { name?: string };
  video_files?: PexelsVideoFile[];
}
interface PexelsResp { videos?: PexelsVideo[]; error?: string }

/** Pick the best fetchable file for a clip: prefer HD mp4, then any mp4, then anything. */
function chooseFile(v: PexelsVideo): PexelsVideoFile | undefined {
  const files = v.video_files ?? [];
  const mp4 = files.filter((f) => f.file_type === 'video/mp4' && f.link);
  return mp4.find((f) => f.quality === 'hd') ?? mp4[0] ?? files.find((f) => f.link);
}

function toClip(v: PexelsVideo): FootageClip | null {
  const file = chooseFile(v);
  if (!file?.link) return null;
  return {
    id: String(v.id ?? ''),
    url: file.link,
    thumbnailUrl: v.image,
    width: file.width ?? v.width,
    height: file.height ?? v.height,
    durationSec: v.duration,
    source: 'pexels',
    author: v.user?.name,
    pageUrl: v.url,
  };
}

/**
 * Searches Pexels for real, copyright-free stock video by topic — one of
 * OpenMontage's footage sources, brought into Forgecast. Raw injectable fetch,
 * no SDK. Configure with PEXELS_API_KEY (the same key the MoneyPrinter worker uses
 * for stock footage).
 */
export class PexelsFootageProvider implements FootageProvider {
  readonly name = 'pexels';
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: PexelsFootageOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.PEXELS_API_KEY;
    this.baseUrl = (opts.baseUrl ?? 'https://api.pexels.com/videos').replace(/\/$/, '');
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async search(input: FootageSearchInput): Promise<FootageClip[]> {
    if (!this.apiKey) throw new Error('Pexels not configured (set PEXELS_API_KEY)');
    const params = new URLSearchParams({ query: input.query, per_page: String(Math.min(80, Math.max(1, input.perPage ?? 15))) });
    if (input.orientation) params.set('orientation', input.orientation);

    // Pexels uses the raw API key in the Authorization header (no "Bearer").
    const res = await this.fetchFn(`${this.baseUrl}/search?${params.toString()}`, { headers: { Authorization: this.apiKey } });
    const data = (await res.json().catch(() => ({}))) as PexelsResp;
    if (!res.ok) throw new Error(`Pexels footage search failed (${res.status}): ${data.error ?? 'unknown error'}`);
    return (data.videos ?? []).map(toClip).filter((c): c is FootageClip => c !== null);
  }
}
