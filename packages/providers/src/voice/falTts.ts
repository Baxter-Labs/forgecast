import type { VoiceProvider, VoiceGenInput, VoiceGenTask, VoiceGenState } from '@forgecast/core';

export interface FalTtsProviderOptions {
  /** Defaults to process.env.FAL_KEY_VOICE ?? process.env.FAL_KEY. */
  apiKey?: string;
  /** fal text-to-speech model id. */
  model?: string;
  /** Defaults to https://queue.fal.run. */
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

interface SubmitResp { request_id?: string; response_url?: string }
interface StatusResp { status?: string }
interface ResultResp { audio?: { url?: string }; detail?: unknown }

const stateFrom = (s: string | undefined): VoiceGenState =>
  s === 'COMPLETED' ? 'complete' : s === 'FAILED' || s === 'ERROR' ? 'failed' : 'processing';

/**
 * Text-to-speech via fal.ai's async queue API. Reads FAL_KEY_VOICE (falls back to
 * FAL_KEY so voice can reuse the same credential). Implements the provider-agnostic
 * VoiceProvider contract (create → poll getTask).
 *
 * We store response_url from the submit response as the taskId so that getTask always
 * polls the correct endpoint (same normalisation pattern as FalVideoProvider).
 */
export class FalTtsProvider implements VoiceProvider {
  readonly name = 'fal-tts';
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: FalTtsProviderOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.FAL_KEY_VOICE ?? process.env.FAL_KEY;
    this.model = opts.model ?? 'fal-ai/elevenlabs/tts/turbo-v2.5';
    this.baseUrl = (opts.baseUrl ?? 'https://queue.fal.run').replace(/\/$/, '');
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Key ${this.apiKey ?? ''}`, 'Content-Type': 'application/json' };
  }

  async create(input: VoiceGenInput): Promise<{ taskId: string }> {
    if (!this.apiKey) throw new Error('fal TTS not configured (set FAL_KEY_VOICE or FAL_KEY)');
    const model = input.model ?? this.model;

    const body: Record<string, unknown> = { text: input.text };
    if (input.voice) body.voice = input.voice;

    const res = await this.fetchFn(`${this.baseUrl}/${model}`, {
      method: 'POST', headers: this.authHeaders(), body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`fal TTS submit failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as SubmitResp;
    if (!data.request_id) throw new Error('fal TTS response missing request_id');
    const responseUrl = data.response_url ?? `${this.baseUrl}/${this.model}/requests/${data.request_id}`;
    return { taskId: responseUrl };
  }

  async getTask(taskId: string): Promise<VoiceGenTask> {
    if (!this.apiKey) throw new Error('fal TTS not configured (set FAL_KEY_VOICE or FAL_KEY)');
    const statusRes = await this.fetchFn(`${taskId}/status`, { headers: this.authHeaders() });
    if (!statusRes.ok) return { taskId, state: 'failed' };
    const status = stateFrom(((await statusRes.json()) as StatusResp).status);
    if (status !== 'complete') return { taskId, state: status };

    // Completed → fetch the result payload for the audio URL.
    const resultRes = await this.fetchFn(taskId, { headers: this.authHeaders() });
    if (!resultRes.ok) return { taskId, state: 'failed' };
    const url = ((await resultRes.json()) as ResultResp).audio?.url;
    return url ? { taskId, state: 'complete', audioUrl: url } : { taskId, state: 'failed' };
  }
}
