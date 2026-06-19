import { describe, it, expect, vi } from 'vitest';
import { MoneyPrinterWorker } from '../src/index';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('MoneyPrinterWorker', () => {
  it('is unavailable without a base url', () => {
    expect(new MoneyPrinterWorker({ baseUrl: undefined }).isAvailable()).toBe(false);
  });

  it('creates a video task (POST /api/v1/videos with video_subject)', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ data: { task_id: 't1' } }));
    const w = new MoneyPrinterWorker({ baseUrl: 'http://worker:8080', fetchFn });
    const { taskId } = await w.createVideo({ subject: 'cats in space', extra: { video_aspect: 'portrait' } });
    expect(taskId).toBe('t1');
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('http://worker:8080/api/v1/videos');
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.video_subject).toBe('cats in space');
    expect(sent.video_aspect).toBe('portrait');
  });

  it('maps task state and resolves the combined video url when complete', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ data: { state: 1, progress: 100, combined_videos: ['/tasks/t1/combined-1.mp4'] } }),
    );
    const w = new MoneyPrinterWorker({ baseUrl: 'http://worker:8080', fetchFn });
    const task = await w.getTask('t1');
    expect(task.state).toBe('complete');
    expect(task.progress).toBe(100);
    expect(task.videoUrl).toBe('http://worker:8080/tasks/t1/combined-1.mp4');
  });

  it('reports processing without a url', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ data: { state: 4, progress: 40 } }));
    const w = new MoneyPrinterWorker({ baseUrl: 'http://worker:8080', fetchFn });
    const task = await w.getTask('t1');
    expect(task.state).toBe('processing');
    expect(task.videoUrl).toBeUndefined();
  });

  it('maps failure state', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ data: { state: -1, progress: 0 } }));
    const w = new MoneyPrinterWorker({ baseUrl: 'http://worker:8080', fetchFn });
    expect((await w.getTask('t1')).state).toBe('failed');
  });

  it('keeps an already-absolute video url as-is', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ data: { state: 1, progress: 100, combined_videos: ['https://cdn/x/combined-1.mp4'] } }),
    );
    const w = new MoneyPrinterWorker({ baseUrl: 'http://worker:8080', fetchFn });
    expect((await w.getTask('t1')).videoUrl).toBe('https://cdn/x/combined-1.mp4');
  });
});
