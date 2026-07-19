import type { LoraTrainer, LoraTrainInput, LoraTrainTask, LoraTrainState } from '@forgecast/core';

export interface FalLoraTrainerOptions {
  /** Defaults to process.env.FAL_KEY (training is billed like image work). */
  apiKey?: string;
  /** fal trainer model id. */
  model?: string;
  /** Defaults to https://queue.fal.run. */
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

interface SubmitResp { request_id?: string; response_url?: string }
interface StatusResp { status?: string }
interface ResultResp { diffusers_lora_file?: { url?: string } }

const stateFrom = (s: string | undefined): LoraTrainState =>
  s === 'COMPLETED' ? 'complete' : s === 'FAILED' || s === 'ERROR' ? 'failed' : 'processing';

/**
 * Character LoRA training via fal.ai's async queue API
 * (`fal-ai/flux-lora-fast-training`: a ZIP of portraits → LoRA weights in
 * ~5–15 min). Same submit-then-poll shape as FalVideoProvider: the submit
 * response_url is stored as the taskId so getTask always polls the right
 * app-level endpoint.
 */
export class FalLoraTrainer implements LoraTrainer {
  readonly name = 'fal-lora';
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: FalLoraTrainerOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.FAL_KEY;
    this.model = opts.model ?? 'fal-ai/flux-lora-fast-training';
    this.baseUrl = (opts.baseUrl ?? 'https://queue.fal.run').replace(/\/$/, '');
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Key ${this.apiKey ?? ''}`, 'Content-Type': 'application/json' };
  }

  async create(input: LoraTrainInput): Promise<{ taskId: string }> {
    if (!this.apiKey) throw new Error('fal LoRA training not configured (set FAL_KEY)');
    const body: Record<string, unknown> = { images_data_url: input.imagesDataUrl };
    if (input.triggerWord) body.trigger_word = input.triggerWord;
    if (input.steps) body.steps = input.steps;

    const res = await this.fetchFn(`${this.baseUrl}/${this.model}`, {
      method: 'POST', headers: this.authHeaders(), body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`fal LoRA training submit failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as SubmitResp;
    if (!data.request_id) throw new Error('fal LoRA training response missing request_id');
    const responseUrl = data.response_url ?? `${this.baseUrl}/${this.model}/requests/${data.request_id}`;
    return { taskId: responseUrl };
  }

  async getTask(taskId: string): Promise<LoraTrainTask> {
    // taskId is the response_url from create() — a fully qualified URL.
    if (!this.apiKey) throw new Error('fal LoRA training not configured (set FAL_KEY)');
    const statusRes = await this.fetchFn(`${taskId}/status`, { headers: this.authHeaders() });
    if (!statusRes.ok) return { taskId, state: 'failed' };
    const state = stateFrom(((await statusRes.json()) as StatusResp).status);
    if (state !== 'complete') return { taskId, state };

    const resultRes = await this.fetchFn(taskId, { headers: this.authHeaders() });
    if (!resultRes.ok) return { taskId, state: 'failed' };
    const url = ((await resultRes.json()) as ResultResp).diffusers_lora_file?.url;
    return url ? { taskId, state: 'complete', loraUrl: url } : { taskId, state: 'failed' };
  }
}
