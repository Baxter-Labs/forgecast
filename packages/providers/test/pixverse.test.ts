import { describe, it, expect, vi } from 'vitest';
import { PixverseVideoProvider } from '../src/index';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
const opts = (fetchFn: typeof fetch) => ({ apiKey: 'k', fetchFn, traceIdGen: () => 'trace-1' });

describe('PixverseVideoProvider', () => {
  it('is unavailable without an api key', () => {
    expect(new PixverseVideoProvider({ apiKey: undefined }).isAvailable()).toBe(false);
  });

  it('creates a generation with the right endpoint, headers, and body', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ ErrCode: 0, ErrMsg: 'success', Resp: { video_id: 4242 } }));
    const p = new PixverseVideoProvider(opts(fetchFn));
    const { taskId } = await p.create({ prompt: 'a fox', aspectRatio: '9:16', duration: 5, quality: '720p' });
    expect(taskId).toBe('4242');
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://app-api.pixverse.ai/openapi/v2/video/text/generate');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ 'API-KEY': 'k', 'Ai-trace-id': 'trace-1' });
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent).toMatchObject({ prompt: 'a fox', aspect_ratio: '9:16', duration: 5, quality: '720p' });
    expect(typeof sent.model).toBe('string');
  });

  it('maps status: 1=complete (with url), 5=processing, 8=failed', async () => {
    const complete = new PixverseVideoProvider(opts(vi.fn(async () => json({ Resp: { status: 1, url: 'https://cdn/v.mp4' } }))));
    expect(await complete.getTask('1')).toEqual({ taskId: '1', state: 'complete', videoUrl: 'https://cdn/v.mp4' });

    const proc = new PixverseVideoProvider(opts(vi.fn(async () => json({ Resp: { status: 5 } }))));
    expect((await proc.getTask('1')).state).toBe('processing');

    const failed = new PixverseVideoProvider(opts(vi.fn(async () => json({ Resp: { status: 8 } }))));
    expect((await failed.getTask('1')).state).toBe('failed');
  });

  it('hits the result endpoint for status', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ Resp: { status: 5 } }));
    await new PixverseVideoProvider(opts(fetchFn)).getTask('99');
    expect(fetchFn.mock.calls[0]![0]).toBe('https://app-api.pixverse.ai/openapi/v2/video/result/99');
  });

  it('throws on a pixverse error envelope', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ ErrCode: 400123, ErrMsg: 'bad prompt', Resp: {} }));
    await expect(new PixverseVideoProvider(opts(fetchFn)).create({ prompt: 'x' })).rejects.toThrowError(/bad prompt|400123/);
  });
});
