import { describe, it, expect, vi } from 'vitest';
import { HttpWebsiteReader } from '../src/index';

const SAMPLE_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>ACME Eco Shoes</title>
  <meta property="og:site_name" content="ACME" />
  <meta name="description" content="Sustainable sneakers for the planet." />
  <meta property="og:image" content="https://acme.com/og.jpg" />
  <script>alert('boom')</script>
  <style>.hidden { display:none }</style>
</head>
<body>
  <nav>Skip nav</nav>
  <header>Skip header</header>
  <h1>Welcome to ACME</h1>
  <h2>Our Mission</h2>
  <h3>Eco Materials</h3>
  <p>We make shoes from recycled ocean plastic.</p>
  <li>Zero carbon manufacturing</li>
  <img src="/p.png" alt="product" />
  <footer>Footer text</footer>
</body>
</html>`;

function makeResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/html' } });
}

describe('HttpWebsiteReader', () => {
  it('extracts title, siteName, description, headings, text from sample HTML', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => makeResponse(SAMPLE_HTML));
    const reader = new HttpWebsiteReader({ fetchFn });

    const info = await reader.read('https://acme.com');

    expect(info.url).toBe('https://acme.com/');
    expect(info.title).toBe('ACME Eco Shoes');
    expect(info.siteName).toBe('ACME');
    expect(info.description).toBe('Sustainable sneakers for the planet.');
    expect(info.headings).toEqual(['Welcome to ACME', 'Our Mission', 'Eco Materials']);
    expect(info.text).toContain('recycled ocean plastic');
    expect(info.text).toContain('Zero carbon manufacturing');
    // noise nodes must be excluded from text
    expect(info.text).not.toContain('boom');
    expect(info.text).not.toContain('.hidden');
    expect(info.text).not.toContain('Skip nav');
    expect(info.text).not.toContain('Skip header');
    expect(info.text).not.toContain('Footer text');
  });

  it('resolves relative img src to absolute and deduplicates og:image + img', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => makeResponse(SAMPLE_HTML));
    const reader = new HttpWebsiteReader({ fetchFn });

    const info = await reader.read('https://acme.com');

    expect(info.images).toContain('https://acme.com/og.jpg');
    expect(info.images).toContain('https://acme.com/p.png');
    // deduplication: same URL not listed twice
    const seen = new Set<string>();
    for (const img of info.images) {
      expect(seen.has(img)).toBe(false);
      seen.add(img);
    }
  });

  it('prepends https:// to bare domains and fetches the normalized URL', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => makeResponse(SAMPLE_HTML));
    const reader = new HttpWebsiteReader({ fetchFn });

    await reader.read('example.com');

    const calledUrl = fetchFn.mock.calls[0]![0] as string;
    expect(calledUrl).toBe('https://example.com/');
  });

  it('throws on non-http(s) protocols', async () => {
    const reader = new HttpWebsiteReader({ fetchFn: vi.fn() });
    await expect(reader.read('ftp://example.com')).rejects.toThrow('only http(s) URLs are supported');
  });

  it('rejects localhost (SSRF guard)', async () => {
    const reader = new HttpWebsiteReader({ fetchFn: vi.fn() });
    await expect(reader.read('http://localhost')).rejects.toThrow('refusing to fetch a private or local address');
  });

  it('rejects private IPv4 192.168.x.x (SSRF guard)', async () => {
    const reader = new HttpWebsiteReader({ fetchFn: vi.fn() });
    await expect(reader.read('http://192.168.1.10')).rejects.toThrow('refusing to fetch a private or local address');
  });

  it('rejects private IPv4 10.x.x.x (SSRF guard)', async () => {
    const reader = new HttpWebsiteReader({ fetchFn: vi.fn() });
    await expect(reader.read('http://10.0.0.1')).rejects.toThrow('refusing to fetch a private or local address');
  });

  it('rejects private IPv4 172.16-31.x.x (SSRF guard)', async () => {
    const reader = new HttpWebsiteReader({ fetchFn: vi.fn() });
    await expect(reader.read('http://172.20.0.5')).rejects.toThrow('refusing to fetch a private or local address');
  });

  it('allows public 172.32.x.x (outside private range)', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => makeResponse('<html><head><title>T</title></head><body><p>text</p></body></html>'));
    const reader = new HttpWebsiteReader({ fetchFn });
    // Should not throw — 172.32.x is outside the private 172.16-31 range
    await expect(reader.read('http://172.32.0.1')).resolves.toBeDefined();
  });

  it('throws when fetch returns a non-ok status', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => makeResponse('Not Found', 404));
    const reader = new HttpWebsiteReader({ fetchFn });
    await expect(reader.read('https://acme.com')).rejects.toThrow('fetch failed (404)');
  });

  it('truncates text to maxChars', async () => {
    const longText = 'word '.repeat(2000);
    const html = `<html><head><title>T</title></head><body><p>${longText}</p></body></html>`;
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => makeResponse(html));
    const reader = new HttpWebsiteReader({ fetchFn, maxChars: 100 });
    const info = await reader.read('https://acme.com');
    expect(info.text.length).toBeLessThanOrEqual(100);
  });

  it('falls back to og:title when <title> is absent', async () => {
    const html = `<html><head><meta property="og:title" content="OG Title" /></head><body><p>hi</p></body></html>`;
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => makeResponse(html));
    const info = await new HttpWebsiteReader({ fetchFn }).read('https://acme.com');
    expect(info.title).toBe('OG Title');
  });

  it('falls back to og:description when meta[name=description] is absent', async () => {
    const html = `<html><head><meta property="og:description" content="OG Desc" /></head><body><p>hi</p></body></html>`;
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => makeResponse(html));
    const info = await new HttpWebsiteReader({ fetchFn }).read('https://acme.com');
    expect(info.description).toBe('OG Desc');
  });
});
