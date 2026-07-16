import {
  ProviderUnavailableError,
  type VoiceProvider,
  type VoiceGenInput,
  type VoiceGenTask,
} from '@forgecast/core';
import type { WorkersAiRunner } from '../image/cloudflare';

export interface CloudflareTtsProviderOptions {
  /** The Workers AI binding (env.AI). Present on the Cloudflare deploy → keyless. */
  runner?: WorkersAiRunner;
  /** REST fallback (off-Workers): Cloudflare account id. Falls back to CLOUDFLARE_ACCOUNT_ID. */
  accountId?: string;
  /** REST fallback: an API token with Workers AI access. Falls back to CLOUDFLARE_AI_API_TOKEN. */
  apiToken?: string;
  /** TTS model id. Falls back to CF_AI_TTS_MODEL, then MeloTTS. */
  model?: string;
  /** Injectable fetch for the REST path (tests). */
  fetchFn?: typeof fetch;
}

/** Defensive shape covering both the binding (unwrapped) and REST (`result`-wrapped) responses. */
interface WorkersAiTtsResult { audio?: string; result?: { audio?: string } }

/**
 * MeloTTS caps the prompt length; longer scripts must be chunked by the caller.
 * Kept conservative so the error is ours (actionable) rather than an opaque 4xx.
 */
const MAX_TEXT_LENGTH = 2000;

/** MeloTTS language codes. `voice` doubles as the language selector on this provider. */
const MELO_LANGS = new Set(['en', 'es', 'fr', 'zh', 'jp', 'kr']);

const langFromVoice = (voice: string | undefined): string => {
  const v = voice?.trim().toLowerCase();
  return v && MELO_LANGS.has(v) ? v : 'en';
};

/**
 * Keyless, on-deploy VOICE generation via Cloudflare Workers AI (MeloTTS — MIT,
 * first-party, neuron-billed: ~536 free audio-minutes/day on the free allowance).
 *
 * This is the voice sibling of the keyless FLUX image default: no API key, it runs
 * through the Worker's `AI` binding. Off Workers it can use the Workers AI REST API
 * when CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_AI_API_TOKEN are set; otherwise it reports
 * unavailable and the app falls back to VoxCPM (self-host) or fal (BYO key).
 *
 * MeloTTS is synchronous and returns a base64 MP3, so this provider follows the
 * VoxCPM sync contract: create() does the whole generation and hands back the audio
 * as a `data:` URI in the taskId; getTask() resolves it immediately. (The voiceover
 * job handler decodes `data:` URIs inline — Workers fetch() rejects them.)
 */
export class CloudflareTtsProvider implements VoiceProvider {
  readonly name = 'cloudflare';
  private readonly runner: WorkersAiRunner | undefined;
  private readonly accountId: string | undefined;
  private readonly apiToken: string | undefined;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: CloudflareTtsProviderOptions = {}) {
    this.runner = opts.runner;
    this.accountId = opts.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID;
    this.apiToken = opts.apiToken ?? process.env.CLOUDFLARE_AI_API_TOKEN;
    this.model = opts.model ?? process.env.CF_AI_TTS_MODEL ?? '@cf/myshell-ai/melotts';
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  isAvailable(): boolean {
    return Boolean(this.runner) || Boolean(this.accountId && this.apiToken);
  }

  async create(input: VoiceGenInput): Promise<{ taskId: string }> {
    if (!this.isAvailable()) throw new ProviderUnavailableError(this.name);
    if (input.text.length > MAX_TEXT_LENGTH) {
      throw new Error(
        `voice-over script is too long for ${this.model} (${input.text.length} chars, max ${MAX_TEXT_LENGTH}) — ` +
          'split it into shorter voiceovers or shorten the script',
      );
    }

    const model = input.model ?? this.model;
    const inputs: Record<string, unknown> = { prompt: input.text, lang: langFromVoice(input.voice) };

    const raw = this.runner
      ? ((await this.runner.run(model, inputs)) as WorkersAiTtsResult)
      : await this.runViaRest(model, inputs);

    const b64 = raw?.audio ?? raw?.result?.audio;
    if (!b64) throw new Error('Cloudflare Workers AI response missing audio');
    return { taskId: `data:audio/mpeg;base64,${b64}` };
  }

  async getTask(taskId: string): Promise<VoiceGenTask> {
    // Synchronous provider: the taskId IS the finished audio (VoxCPM contract).
    return { taskId, state: 'complete', audioUrl: taskId };
  }

  private async runViaRest(model: string, inputs: Record<string, unknown>): Promise<WorkersAiTtsResult> {
    const res = await this.fetchFn(
      `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${model}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiToken ?? ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(inputs),
      },
    );
    if (!res.ok) throw new Error(`Cloudflare Workers AI TTS request failed (${res.status}): ${await res.text()}`);
    return (await res.json()) as WorkersAiTtsResult;
  }
}
