import { describe, it, expect, vi } from 'vitest';
import { CloudflareVideoProvider } from '../src/video/cloudflare';

describe('CloudflareVideoProvider', () => {
  it('is unavailable without an EXPLICIT model — every CF video model is partner-billed', () => {
    // Creds alone are not enough: the old vidu default errored 2021 at call time
    // while health advertised video as available. Explicit model = billing opt-in.
    expect(new CloudflareVideoProvider({}).isAvailable()).toBe(false);
    expect(new CloudflareVideoProvider({ runner: { run: async () => ({}) } }).isAvailable()).toBe(false);
    expect(new CloudflareVideoProvider({ accountId: 'a', apiToken: 't' }).isAvailable()).toBe(false);
    expect(new CloudflareVideoProvider({ runner: { run: async () => ({}) }, model: 'vidu/q3-turbo' }).isAvailable()).toBe(true);
    expect(new CloudflareVideoProvider({ accountId: 'a', apiToken: 't', model: 'vidu/q3-turbo' }).isAvailable()).toBe(true);
  });

  it('maps the opaque partner-billing error 2021 to an actionable message', async () => {
    const run = vi.fn(async () => { throw new Error('AiError: 2021: Invalid User Credentials'); });
    const p = new CloudflareVideoProvider({ runner: { run }, model: 'vidu/q3-turbo' });
    await expect(p.create({ prompt: 'x' })).rejects.toThrow(/partner-billed.*hf-spaces|partner-billed.*fal/is);
  });

  it('submits via the async queue API and returns a pollable task id', async () => {
    const run = vi.fn(async () => ({ request_id: 'r1' }));
    const p = new CloudflareVideoProvider({ runner: { run }, model: 'vidu/q3-turbo' });
    const { taskId } = await p.create({ prompt: 'a fox', aspectRatio: '9:16', duration: 5 });
    expect(run).toHaveBeenCalledWith('vidu/q3-turbo', { prompt: 'a fox', aspect_ratio: '9:16', duration: 5 }, { queueRequest: true });
    expect(taskId).toBe('req::vidu/q3-turbo::r1');
  });

  it('polls a queued request: running → processing, then complete with the mp4 url', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ status: 'running' })
      .mockResolvedValueOnce({ result: { video: 'https://cf/v.mp4' } });
    const p = new CloudflareVideoProvider({ runner: { run }, model: 'vidu/q3-turbo' });
    const t1 = await p.getTask('req::vidu/q3-turbo::r1');
    expect(t1.state).toBe('processing');
    const t2 = await p.getTask('req::vidu/q3-turbo::r1');
    expect(run).toHaveBeenLastCalledWith('vidu/q3-turbo', { request_id: 'r1' });
    expect(t2).toEqual({ taskId: 'req::vidu/q3-turbo::r1', state: 'complete', videoUrl: 'https://cf/v.mp4' });
  });

  it('handles a synchronous model that returns the video url directly', async () => {
    const run = vi.fn(async () => ({ state: 'Completed', result: { video: 'https://cf/sync.mp4' } }));
    const p = new CloudflareVideoProvider({ runner: { run }, model: 'vidu/q3-turbo' });
    const { taskId } = await p.create({ prompt: 'p' });
    expect(taskId).toBe('url::https://cf/sync.mp4');
    const t = await p.getTask(taskId);
    expect(t).toEqual({ taskId, state: 'complete', videoUrl: 'https://cf/sync.mp4' });
  });

  it('maps an image source to start_image for image-to-video', async () => {
    const run = vi.fn(async () => ({ request_id: 'r2' }));
    const p = new CloudflareVideoProvider({ runner: { run }, model: 'vidu/q3-turbo' });
    await p.create({ prompt: 'move', imageUrl: 'data:image/png;base64,AAA' });
    expect(run).toHaveBeenCalledWith('vidu/q3-turbo', { prompt: 'move', start_image: 'data:image/png;base64,AAA' }, { queueRequest: true });
  });

  it('reports failed on a broken task id and on an explicit failure status', async () => {
    const p = new CloudflareVideoProvider({ runner: { run: async () => ({ status: 'failed' }) }, model: 'vidu/q3-turbo' });
    expect((await p.getTask('garbage')).state).toBe('failed');
    expect((await p.getTask('req::vidu/q3-turbo::r1')).state).toBe('failed');
  });
});
