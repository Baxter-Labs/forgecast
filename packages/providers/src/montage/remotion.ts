import type { MontageWorker, MontageSpec, VideoGenTask, VideoGenState } from '@forgecast/core';

export interface RemotionMontageWorkerOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

interface RenderResp { taskId?: string }
interface TaskResp { state?: string; videoUrl?: string }

const stateFrom = (s: string | undefined): VideoGenState =>
  s === 'complete' ? 'complete' : s === 'failed' ? 'failed' : 'processing';

export class RemotionMontageWorker implements MontageWorker {
  readonly name = 'remotion';
  private readonly baseUrl: string | undefined;
  private readonly fetchFn: typeof fetch;

  constructor(opts: RemotionMontageWorkerOptions = {}) {
    const url = opts.baseUrl ?? process.env.MONTAGE_WORKER_URL;
    this.baseUrl = url ? url.replace(/\/$/, '') : undefined;
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  isAvailable(): boolean {
    return Boolean(this.baseUrl);
  }

  async render(spec: MontageSpec): Promise<{ taskId: string }> {
    const base = this.requireBase();
    const res = await this.fetchFn(`${base}/render`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(spec),
    });
    if (!res.ok) throw new Error(`montage render failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as RenderResp;
    if (!data.taskId) throw new Error('montage response missing taskId');
    return { taskId: data.taskId };
  }

  async getTask(taskId: string): Promise<VideoGenTask> {
    const base = this.requireBase();
    const res = await this.fetchFn(`${base}/render/${taskId}`);
    if (!res.ok) throw new Error(`montage task query failed (${res.status})`);
    const data = (await res.json()) as TaskResp;
    const state = stateFrom(data.state);
    return { taskId, state, videoUrl: state === 'complete' ? data.videoUrl : undefined };
  }

  private requireBase(): string {
    if (!this.baseUrl) throw new Error('Montage worker URL not configured (set MONTAGE_WORKER_URL)');
    return this.baseUrl;
  }
}
