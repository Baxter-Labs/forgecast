import { describe, it, expect, vi, afterEach } from 'vitest';
import { HfSpacesVideoProvider } from '../src/video/hfspaces';

const LTX_HOST = 'lightricks-ltx-video-distilled.hf.space';

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (url: Parameters<typeof fetch>[0], init?: RequestInit) => handler(String(url), init ?? {})) as unknown as typeof fetch;
}

const sse = (events: Array<[string, string]>): string =>
  events.map(([e, d]) => `event: ${e}\ndata: ${d}\n\n`).join('');

afterEach(() => {
  delete process.env.HF_SPACES_ALLOW_ANON;
});

describe('HfSpacesVideoProvider', () => {
  it('availability: token OR the explicit anon opt-in (shared egress makes anon useless hosted)', () => {
    expect(new HfSpacesVideoProvider({}).isAvailable()).toBe(false);
    expect(new HfSpacesVideoProvider({ token: 'hf_x' }).isAvailable()).toBe(true);
    process.env.HF_SPACES_ALLOW_ANON = '1';
    expect(new HfSpacesVideoProvider({}).isAvailable()).toBe(true);
  });

  it('submits t2v to the LTX space with the verified positional signature + bearer token', async () => {
    const fetchFn = mockFetch((url, init) => {
      expect(url).toBe(`https://${LTX_HOST}/gradio_api/call/text_to_video`);
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer hf_x');
      const body = JSON.parse(String(init.body)) as { data: unknown[] };
      expect(body.data[0]).toBe('a molten anvil');
      expect(body.data[2]).toBeNull();               // no source image for t2v
      expect(body.data[4]).toBe(704);                // 9:16 → h 704
      expect(body.data[5]).toBe(512);                // 9:16 → w 512
      expect(body.data[6]).toBe('text-to-video');
      return new Response(JSON.stringify({ event_id: 'e1' }), { status: 200 });
    });
    const p = new HfSpacesVideoProvider({ token: 'hf_x', fetchFn });
    const { taskId } = await p.create({ prompt: 'a molten anvil', aspectRatio: '9:16' });
    expect(taskId).toBe(`hf::${LTX_HOST}::/text_to_video::e1`);
  });

  it('routes an imageUrl to the i2v endpoint as gradio FileData', async () => {
    const fetchFn = mockFetch((url, init) => {
      expect(url).toContain('/gradio_api/call/image_to_video');
      const body = JSON.parse(String(init.body)) as { data: Array<Record<string, unknown> | null> };
      expect(body.data[2]).toMatchObject({ url: 'https://cdn/frame.png' });
      return new Response(JSON.stringify({ event_id: 'e2' }), { status: 200 });
    });
    const p = new HfSpacesVideoProvider({ token: 'hf_x', fetchFn });
    await p.create({ prompt: 'bring it alive', imageUrl: 'https://cdn/frame.png' });
  });

  it('completes when the SSE stream ends with a video FileData', async () => {
    const fetchFn = mockFetch(() =>
      new Response(sse([
        ['generating', '[null]'],
        ['complete', JSON.stringify([{ video: { url: 'https://space/file=out.mp4' } }, 42])],
      ]), { status: 200 }));
    const p = new HfSpacesVideoProvider({ token: 'hf_x', fetchFn });
    const t = await p.getTask(`hf::${LTX_HOST}::/text_to_video::e1`);
    expect(t).toEqual({ taskId: `hf::${LTX_HOST}::/text_to_video::e1`, state: 'complete', videoUrl: 'https://space/file=out.mp4' });
  });

  it('builds a file= URL when the return only has a path', async () => {
    const fetchFn = mockFetch(() =>
      new Response(sse([['complete', JSON.stringify([{ video: { path: '/tmp/out.mp4' } }, 1])]]), { status: 200 }));
    const p = new HfSpacesVideoProvider({ token: 'hf_x', fetchFn });
    const t = await p.getTask(`hf::${LTX_HOST}::/text_to_video::e1`);
    expect(t.videoUrl).toBe(`https://${LTX_HOST}/gradio_api/file=/tmp/out.mp4`);
  });

  it('maps a null-data error event (the anon/quota rejection seen live) to the actionable quota message', async () => {
    const fetchFn = mockFetch(() => new Response(sse([['error', 'null']]), { status: 200 }));
    const p = new HfSpacesVideoProvider({ token: 'hf_x', fetchFn });
    const t = await p.getTask(`hf::${LTX_HOST}::/text_to_video::e1`);
    expect(t.state).toBe('failed');
    expect(t.error).toMatch(/free hugging face token/i);
  });

  it('reports processing on a deadline abort and on a stream with no terminal event', async () => {
    const hang = mockFetch((_url, init) => new Promise<Response>((_resolve, reject) => {
      (init.signal as AbortSignal | undefined)?.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const p = new HfSpacesVideoProvider({ token: 'hf_x', fetchFn: hang, pollDeadlineMs: 30 });
    const t = await p.getTask(`hf::${LTX_HOST}::/text_to_video::e1`);
    expect(t.state).toBe('processing');

    const empty = mockFetch(() => new Response(sse([['generating', '[null]']]), { status: 200 }));
    const p2 = new HfSpacesVideoProvider({ token: 'hf_x', fetchFn: empty });
    expect((await p2.getTask(`hf::${LTX_HOST}::/text_to_video::e1`)).state).toBe('processing');
  });

  it('fails cleanly when the one-shot stream is already consumed (404)', async () => {
    const fetchFn = mockFetch(() => new Response('not found', { status: 404 }));
    const p = new HfSpacesVideoProvider({ token: 'hf_x', fetchFn });
    const t = await p.getTask(`hf::${LTX_HOST}::/text_to_video::e1`);
    expect(t.state).toBe('failed');
    expect(t.error).toMatch(/try again/i);
  });

  it('maps a 429 submit to the quota message and rejects unsupported inputs', async () => {
    const fetchFn = mockFetch(() => new Response('GPU quota exceeded', { status: 429 }));
    const p = new HfSpacesVideoProvider({ token: 'hf_x', fetchFn });
    await expect(p.create({ prompt: 'x' })).rejects.toThrow(/free hugging face token/i);
    // wan2-1-fast is i2v-only: explicitly selecting it for t2v is a clear error.
    const p2 = new HfSpacesVideoProvider({ token: 'hf_x', fetchFn });
    await expect(p2.create({ prompt: 'x', model: 'wan2-1-fast' })).rejects.toThrow(/text-to-video via 'wan2-1-fast'/i);
  });
});
