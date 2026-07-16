import { describe, it, expect, vi } from 'vitest';
import { CloudflareTtsProvider } from '../src/voice/cloudflareTts';

function mockFetch(handler: (url: string, init: RequestInit) => Response) {
  return vi.fn(async (url: Parameters<typeof fetch>[0], init?: RequestInit) => handler(String(url), init ?? {})) as unknown as typeof fetch;
}

describe('CloudflareTtsProvider', () => {
  it('is unavailable with neither a binding nor REST creds; available with either', () => {
    expect(new CloudflareTtsProvider({}).isAvailable()).toBe(false);
    expect(new CloudflareTtsProvider({ runner: { run: async () => ({}) } }).isAvailable()).toBe(true);
    expect(new CloudflareTtsProvider({ accountId: 'a', apiToken: 't' }).isAvailable()).toBe(true);
  });

  it('synthesizes via the AI binding and hands back a data: URI as a completed task', async () => {
    const run = vi.fn(async () => ({ audio: 'QUJD' })); // base64 for "ABC"
    const p = new CloudflareTtsProvider({ runner: { run } });
    const { taskId } = await p.create({ text: 'hello there' });
    expect(run).toHaveBeenCalledWith('@cf/myshell-ai/melotts', { prompt: 'hello there', lang: 'en' });
    expect(taskId).toBe('data:audio/mpeg;base64,QUJD');
    const task = await p.getTask(taskId);
    expect(task.state).toBe('complete');
    expect(task.audioUrl).toBe(taskId);
  });

  it('maps a MeloTTS language passed as the voice; defaults to en otherwise', async () => {
    const run = vi.fn(async () => ({ audio: 'x' }));
    const p = new CloudflareTtsProvider({ runner: { run } });
    await p.create({ text: 'bonjour', voice: 'fr' });
    expect(run).toHaveBeenLastCalledWith('@cf/myshell-ai/melotts', { prompt: 'bonjour', lang: 'fr' });
    await p.create({ text: 'hi', voice: 'rachel' });
    expect(run).toHaveBeenLastCalledWith('@cf/myshell-ai/melotts', { prompt: 'hi', lang: 'en' });
  });

  it('synthesizes via the REST fallback (result.audio) when there is no binding', async () => {
    const fetchFn = mockFetch((url, init) => {
      expect(url).toContain('/accounts/acc/ai/run/@cf/myshell-ai/melotts');
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
      return new Response(JSON.stringify({ result: { audio: 'REVG' }, success: true }), { status: 200 });
    });
    const p = new CloudflareTtsProvider({ accountId: 'acc', apiToken: 'tok', fetchFn });
    const { taskId } = await p.create({ text: 'hello' });
    expect(taskId).toBe('data:audio/mpeg;base64,REVG');
  });

  it('rejects over-long scripts with an actionable error before calling the model', async () => {
    const run = vi.fn(async () => ({ audio: 'x' }));
    const p = new CloudflareTtsProvider({ runner: { run } });
    await expect(p.create({ text: 'a'.repeat(2001) })).rejects.toThrow(/too long.*split/i);
    expect(run).not.toHaveBeenCalled();
  });

  it('throws when unavailable and when the response has no audio', async () => {
    await expect(new CloudflareTtsProvider({}).create({ text: 'x' })).rejects.toThrow();
    const p = new CloudflareTtsProvider({ runner: { run: async () => ({ notAudio: true }) } });
    await expect(p.create({ text: 'x' })).rejects.toThrow(/missing audio/);
  });
});
