import type { Transcriber, TranscribeInput, TranscribeResult } from '@forgecast/core';

export interface WisprFlowTranscriberOptions {
  /** Defaults to process.env.WISPRFLOW_API_KEY. */
  apiKey?: string;
  /** Defaults to https://platform-api.wisprflow.ai/api/v1/dash/api */
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

interface WisprFlowResponse {
  id?: string;
  text?: string;
  detected_language?: string;
  total_time?: number;
  generated_tokens?: number;
}

/**
 * Speech-to-text via the Wispr Flow REST API.
 * Reads WISPRFLOW_API_KEY. Implements the Transcriber contract.
 *
 * POST https://platform-api.wisprflow.ai/api/v1/dash/api
 * Body: { audio: "<base64 16kHz mono WAV>", language?: ["en"] }
 * Response: { id, text, detected_language, total_time, generated_tokens }
 */
export class WisprFlowTranscriber implements Transcriber {
  readonly name = 'wisprflow';
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: WisprFlowTranscriberOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.WISPRFLOW_API_KEY;
    this.baseUrl = (opts.baseUrl ?? 'https://platform-api.wisprflow.ai/api/v1/dash/api').replace(/\/$/, '');
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async transcribe(input: TranscribeInput): Promise<TranscribeResult> {
    if (!this.apiKey) {
      throw new Error('wispr flow not configured (set WISPRFLOW_API_KEY)');
    }

    const body: Record<string, unknown> = { audio: input.audioBase64Wav };
    if (input.language?.length) {
      body.language = input.language;
    }

    const res = await this.fetchFn(this.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`wispr flow transcription failed (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as WisprFlowResponse;
    return { text: data.text ?? '', detectedLanguage: data.detected_language };
  }
}
