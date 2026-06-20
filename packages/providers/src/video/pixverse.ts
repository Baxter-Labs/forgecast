import { randomUUID } from 'node:crypto';
import type { VideoProvider, VideoGenInput, VideoGenTask, VideoGenState } from '@forgecast/core';

export interface PixverseVideoProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchFn?: typeof fetch;
  traceIdGen?: () => string;
}

interface CreateResp { ErrCode?: number; ErrMsg?: string; Resp?: { video_id?: number } }
interface ResultResp { ErrCode?: number; ErrMsg?: string; Resp?: { status?: number; url?: string } }

const stateFrom = (s: number | undefined): VideoGenState =>
  s === 1 ? 'complete' : s === 7 || s === 8 ? 'failed' : 'processing';

export class PixverseVideoProvider implements VideoProvider {
  readonly name = 'pixverse';
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;
  private readonly traceIdGen: () => string;

  constructor(opts: PixverseVideoProviderOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.PIXVERSE_API_KEY;
    this.baseUrl = (opts.baseUrl ?? 'https://app-api.pixverse.ai').replace(/\/$/, '');
    this.model = opts.model ?? 'v5';
    this.fetchFn = opts.fetchFn ?? fetch;
    this.traceIdGen = opts.traceIdGen ?? (() => randomUUID());
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  private headers(): Record<string, string> {
    return { 'API-KEY': this.apiKey ?? '', 'Ai-trace-id': this.traceIdGen(), 'Content-Type': 'application/json' };
  }

  async create(input: VideoGenInput): Promise<{ taskId: string }> {
    if (!this.apiKey) throw new Error('Pixverse API key not configured (set PIXVERSE_API_KEY)');
    const body = {
      prompt: input.prompt,
      model: input.model ?? this.model,
      aspect_ratio: input.aspectRatio ?? '16:9',
      duration: input.duration ?? 5,
      quality: input.quality ?? '720p',
    };
    const res = await this.fetchFn(`${this.baseUrl}/openapi/v2/video/text/generate`, {
      method: 'POST', headers: this.headers(), body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`pixverse create failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as CreateResp;
    if (data.ErrCode !== undefined && data.ErrCode !== 0) {
      throw new Error(`pixverse error ${data.ErrCode}: ${data.ErrMsg ?? 'unknown'}`);
    }
    const id = data.Resp?.video_id;
    if (id === undefined || id === null) throw new Error('pixverse response missing video_id');
    return { taskId: String(id) };
  }

  async getTask(taskId: string): Promise<VideoGenTask> {
    if (!this.apiKey) throw new Error('Pixverse API key not configured (set PIXVERSE_API_KEY)');
    const res = await this.fetchFn(`${this.baseUrl}/openapi/v2/video/result/${taskId}`, { headers: this.headers() });
    if (!res.ok) throw new Error(`pixverse status failed (${res.status})`);
    const data = (await res.json()) as ResultResp;
    const state = stateFrom(data.Resp?.status);
    const url = data.Resp?.url;
    return { taskId, state, videoUrl: state === 'complete' ? url : undefined };
  }
}
