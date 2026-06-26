import type { VoiceProvider, VoiceGenInput, VoiceGenTask } from '@forgecast/core';

export interface VoxCpmVoiceProviderOptions {
  /** Self-hosted VoxCPM worker base URL. Defaults to process.env.VOXCPM_URL. */
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

/**
 * Voice-over provider backed by a self-hosted VoxCPM-2 worker (Apache-2.0).
 * https://github.com/OpenBMB/VoxCPM
 *
 * VoxCPM synthesises audio synchronously: a single POST /tts call returns the
 * finished audio URL. There is no async queue to poll — taskId IS the audio URL.
 *
 * Set VOXCPM_URL to the worker's base URL (e.g. http://localhost:8770) to
 * activate this provider. When unset, isAvailable() returns false and Forgecast
 * falls back to the cloud fal TTS provider.
 */
export class VoxCpmVoiceProvider implements VoiceProvider {
  readonly name = 'voxcpm';
  private readonly baseUrl: string | undefined;
  private readonly fetchFn: typeof fetch;

  constructor(opts: VoxCpmVoiceProviderOptions = {}) {
    const raw = opts.baseUrl ?? process.env.VOXCPM_URL;
    this.baseUrl = raw ? raw.replace(/\/$/, '') : undefined;
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  isAvailable(): boolean {
    return Boolean(this.baseUrl);
  }

  async create(input: VoiceGenInput): Promise<{ taskId: string }> {
    if (!this.baseUrl) throw new Error('VoxCPM provider not configured (set VOXCPM_URL)');

    const body: Record<string, unknown> = { text: input.text };
    if (input.voice) body.voice = input.voice;

    const res = await this.fetchFn(`${this.baseUrl}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`voxcpm tts failed (${res.status}): ${await res.text()}`);

    const data = (await res.json()) as { audio_url?: string };
    if (!data.audio_url) throw new Error('voxcpm response missing audio_url');

    // Resolve relative paths against baseUrl so the voiceover handler can
    // fetch the audio directly without knowing the worker's origin.
    const audioUrl = data.audio_url.startsWith('/')
      ? `${this.baseUrl}${data.audio_url}`
      : data.audio_url;

    return { taskId: audioUrl };
  }

  async getTask(taskId: string): Promise<VoiceGenTask> {
    // VoxCPM synthesises synchronously — audio is ready as soon as create()
    // returns, so taskId is already the finished audio URL.
    return { taskId, state: 'complete', audioUrl: taskId };
  }
}
