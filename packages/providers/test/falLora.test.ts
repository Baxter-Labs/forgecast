import { describe, it, expect, vi } from 'vitest';
import { FalLoraTrainer } from '../src/index';

const BASE = 'https://queue.fal.run';
const MODEL = 'fal-ai/flux-lora-fast-training';
const REQUEST_ID = 'req-7';
const RESPONSE_URL = `${BASE}/${MODEL}/requests/${REQUEST_ID}`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
const opts = (fetchFn: typeof fetch) => ({ apiKey: 'k', fetchFn });

describe('FalLoraTrainer', () => {
  it('is unavailable without an api key', () => {
    expect(new FalLoraTrainer({ apiKey: undefined }).isAvailable()).toBe(false);
  });

  it('submits the images archive + trigger word to the fal queue', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ request_id: REQUEST_ID, response_url: RESPONSE_URL }),
    );
    const t = new FalLoraTrainer(opts(fetchFn));
    const { taskId } = await t.create({ imagesDataUrl: 'data:application/zip;base64,AAAA', triggerWord: 'Nova' });
    expect(taskId).toBe(RESPONSE_URL);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(`${BASE}/${MODEL}`);
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Key k' });
    const parsed = JSON.parse((init as RequestInit).body as string);
    expect(parsed).toMatchObject({ images_data_url: 'data:application/zip;base64,AAAA', trigger_word: 'Nova' });
  });

  it('reports processing while IN_QUEUE / IN_PROGRESS (no result fetch)', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ status: 'IN_PROGRESS' }));
    const task = await new FalLoraTrainer(opts(fetchFn)).getTask(RESPONSE_URL);
    expect(task.state).toBe('processing');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0]![0]).toBe(`${RESPONSE_URL}/status`);
  });

  it('fetches the result and returns the LoRA weights url when COMPLETED', async () => {
    const fetchFn = vi.fn(async (...a: Parameters<typeof fetch>) =>
      String(a[0]).endsWith('/status')
        ? json({ status: 'COMPLETED' })
        : json({ diffusers_lora_file: { url: 'https://cdn/lora.safetensors' } }),
    );
    const task = await new FalLoraTrainer(opts(fetchFn)).getTask(RESPONSE_URL);
    expect(task).toEqual({ taskId: RESPONSE_URL, state: 'complete', loraUrl: 'https://cdn/lora.safetensors' });
  });

  it('maps FAILED / non-ok / missing-weights responses to failed', async () => {
    const failed = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ status: 'FAILED' }));
    expect((await new FalLoraTrainer(opts(failed)).getTask(RESPONSE_URL)).state).toBe('failed');
    const nonOk = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ detail: 'gone' }, 500));
    expect((await new FalLoraTrainer(opts(nonOk)).getTask(RESPONSE_URL)).state).toBe('failed');
    const noUrl = vi.fn(async (...a: Parameters<typeof fetch>) =>
      String(a[0]).endsWith('/status') ? json({ status: 'COMPLETED' }) : json({}),
    );
    expect((await new FalLoraTrainer(opts(noUrl)).getTask(RESPONSE_URL)).state).toBe('failed');
  });

  it('throws a helpful error when submit fails', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ detail: 'unauthorized' }, 401));
    await expect(new FalLoraTrainer(opts(fetchFn)).create({ imagesDataUrl: 'data:x' })).rejects.toThrowError(/401|unauthorized/);
  });
});
