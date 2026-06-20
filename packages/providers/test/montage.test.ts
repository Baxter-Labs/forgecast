import { describe, it, expect, vi } from 'vitest';
import { RemotionMontageWorker } from '../src/index';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
const spec = { scenes: [{ url: 'https://x/a.png', kind: 'image' as const, durationSec: 3 }], aspectRatio: '16:9' };

describe('RemotionMontageWorker', () => {
  it('is unavailable without a base url', () => {
    expect(new RemotionMontageWorker({ baseUrl: undefined }).isAvailable()).toBe(false);
  });

  it('posts the spec to /render and returns a taskId', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ taskId: 'm1' }));
    const w = new RemotionMontageWorker({ baseUrl: 'http://montage:7000', fetchFn });
    const { taskId } = await w.render(spec);
    expect(taskId).toBe('m1');
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('http://montage:7000/render');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual(spec);
  });

  it('maps task state and resolves the video url when complete', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ state: 'complete', videoUrl: 'http://montage:7000/out/m1.mp4' }));
    const w = new RemotionMontageWorker({ baseUrl: 'http://montage:7000', fetchFn });
    const task = await w.getTask('m1');
    expect(task).toEqual({ taskId: 'm1', state: 'complete', videoUrl: 'http://montage:7000/out/m1.mp4' });
    expect(fetchFn.mock.calls[0]![0]).toBe('http://montage:7000/render/m1');
  });

  it('reports processing (no url) and failed', async () => {
    const proc = new RemotionMontageWorker({ baseUrl: 'http://m', fetchFn: vi.fn(async () => json({ state: 'processing' })) });
    expect((await proc.getTask('m1')).state).toBe('processing');
    const failed = new RemotionMontageWorker({ baseUrl: 'http://m', fetchFn: vi.fn(async () => json({ state: 'failed' })) });
    expect((await failed.getTask('m1')).state).toBe('failed');
  });

  it('throws on a non-2xx render', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => new Response('boom', { status: 500 }));
    await expect(new RemotionMontageWorker({ baseUrl: 'http://m', fetchFn }).render(spec)).rejects.toThrowError(/render failed/);
  });
});
