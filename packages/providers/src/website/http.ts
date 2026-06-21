import { parse } from 'node-html-parser';
import type { WebsiteInfo, WebsiteReader } from '@forgecast/core';

export interface HttpWebsiteReaderOptions {
  fetchFn?: typeof fetch;
  maxChars?: number;
  timeoutMs?: number;
}

/** Private IPv4 ranges and special hosts that must not be fetched (SSRF guard). */
function isPrivateOrLocal(hostname: string): boolean {
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.local') ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname === '169.254.169.254'
  ) {
    return true;
  }
  // Private IPv4 ranges: 127.x, 10.x, 192.168.x, 172.16-31.x
  if (
    hostname.startsWith('127.') ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.')
  ) {
    return true;
  }
  // 172.16.0.0/12 → 172.16.x.x – 172.31.x.x
  const m = hostname.match(/^172\.(\d+)\./);
  if (m) {
    const second = parseInt(m[1]!, 10);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

function dedup<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/**
 * Fetches a web page over HTTP(S) and extracts structured info (title, description,
 * headings, body text, images) suitable for grounding an LLM campaign prompt.
 *
 * Security: validates the protocol and rejects private/local addresses (SSRF guard).
 */
export class HttpWebsiteReader implements WebsiteReader {
  private readonly fetchFn: typeof fetch;
  private readonly maxChars: number;
  private readonly timeoutMs: number;

  constructor(opts: HttpWebsiteReaderOptions = {}) {
    this.fetchFn = opts.fetchFn ?? fetch;
    this.maxChars = opts.maxChars ?? 3500;
    this.timeoutMs = opts.timeoutMs ?? 10000;
  }

  async read(url: string): Promise<WebsiteInfo> {
    // Normalize: if there's no scheme, prepend https://
    const normalized = url.trim().includes('://')
      ? url.trim()
      : `https://${url.trim()}`;

    const u = new URL(normalized);

    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      throw new Error('only http(s) URLs are supported');
    }

    if (isPrivateOrLocal(u.hostname)) {
      throw new Error('refusing to fetch a private or local address');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let html: string;
    try {
      const res = await this.fetchFn(u.toString(), {
        headers: {
          'User-Agent': 'ForgecastBot/1.0 (+https://forgecast)',
          Accept: 'text/html',
        },
        redirect: 'follow',
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`fetch failed (${res.status})`);
      html = await res.text();
    } finally {
      clearTimeout(timer);
    }

    const root = parse(html);

    // --- title ---
    const titleEl = root.querySelector('title');
    const ogTitle = root.querySelector('meta[property="og:title"]')?.getAttribute('content');
    const title = titleEl?.text?.trim() || ogTitle;

    // --- siteName ---
    const siteName = root.querySelector('meta[property="og:site_name"]')?.getAttribute('content');

    // --- description ---
    const metaDesc = root.querySelector('meta[name="description"]')?.getAttribute('content');
    const ogDesc = root.querySelector('meta[property="og:description"]')?.getAttribute('content');
    const description = metaDesc || ogDesc;

    // --- remove noise nodes before text extraction ---
    for (const sel of ['script', 'style', 'noscript', 'svg', 'nav', 'footer', 'header']) {
      root.querySelectorAll(sel).forEach((el) => el.remove());
    }

    // --- headings ---
    const headingTexts = root
      .querySelectorAll('h1,h2,h3')
      .map((el) => el.text.trim())
      .filter((t) => t.length > 0);
    const headings = dedup(headingTexts).slice(0, 12);

    // --- body text ---
    const paragraphEls = root.querySelectorAll('p, li, h1, h2, h3');
    let rawText: string;
    if (paragraphEls.length > 0) {
      rawText = paragraphEls.map((el) => el.text).join(' ');
    } else {
      rawText = root.text;
    }
    const text = rawText.replace(/\s+/g, ' ').trim().slice(0, this.maxChars);

    // --- images ---
    const ogImage = root.querySelector('meta[property="og:image"]')?.getAttribute('content');
    const imgSrcs = root.querySelectorAll('img').map((el) => el.getAttribute('src') ?? '');

    const stringSrcs: string[] = ([ogImage, ...imgSrcs] as Array<string | undefined>)
      .filter((src): src is string => typeof src === 'string' && src.length > 0 && !src.startsWith('data:'));

    const candidates = stringSrcs
      .map((src) => {
        try { return new URL(src, u).toString(); } catch { return null; }
      })
      .filter((src): src is string => src !== null);

    const images = dedup(candidates).slice(0, 6);

    return { url: u.toString(), title, siteName, description, headings, text, images };
  }
}
