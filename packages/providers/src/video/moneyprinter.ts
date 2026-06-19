import type {
  ShortVideoWorker, ShortVideoRequest, ShortVideoTask, VideoTaskState,
} from '@forgecast/core';

export interface MoneyPrinterWorkerOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

interface CreateResp { data?: { task_id?: string } }
interface TaskResp {
  data?: { state?: number; progress?: number; combined_videos?: string[]; videos?: string[] };
}

const stateFrom = (n: number | undefined): VideoTaskState =>
  n === 1 ? 'complete' : n === -1 ? 'failed' : 'processing';

export class MoneyPrinterWorker implements ShortVideoWorker {
  readonly name = 'moneyprinter';
  private readonly baseUrl: string | undefined;
  private readonly fetchFn: typeof fetch;

  constructor(opts: MoneyPrinterWorkerOptions = {}) {
    const url = opts.baseUrl ?? process.env.FORGECAST_VIDEO_WORKER_URL;
    this.baseUrl = url ? url.replace(/\/$/, '') : undefined;
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  isAvailable(): boolean {
    return Boolean(this.baseUrl);
  }

  async createVideo(req: ShortVideoRequest): Promise<{ taskId: string }> {
    const base = this.requireBase();
    const body = { video_subject: req.subject, ...req.extra };
    const res = await this.fetchFn(`${base}/api/v1/videos`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`worker create failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as CreateResp;
    const taskId = data.data?.task_id;
    if (!taskId) throw new Error('worker response missing task_id');
    return { taskId };
  }

  async getTask(taskId: string): Promise<ShortVideoTask> {
    const base = this.requireBase();
    const res = await this.fetchFn(`${base}/api/v1/tasks/${taskId}`);
    if (!res.ok) throw new Error(`worker task query failed (${res.status})`);
    const data = (await res.json()) as TaskResp;
    const d = data.data ?? {};
    const state = stateFrom(d.state);
    const uri = d.combined_videos?.[0] ?? d.videos?.[0];
    const videoUrl = state === 'complete' && uri ? this.resolveUrl(uri) : undefined;
    return { taskId, state, progress: d.progress ?? 0, videoUrl };
  }

  private requireBase(): string {
    if (!this.baseUrl) throw new Error('MoneyPrinter worker URL not configured');
    return this.baseUrl;
  }

  private resolveUrl(uri: string): string {
    if (/^https?:\/\//.test(uri)) return uri;
    return `${this.baseUrl}/${uri.replace(/^\//, '')}`;
  }
}
