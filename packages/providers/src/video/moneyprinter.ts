import type {
  ShortVideoWorker, ShortVideoRequest, ShortVideoOptions, ShortVideoTask, VideoTaskState,
} from '@forgecast/core';

export interface MoneyPrinterWorkerOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

/**
 * Map Forgecast's vendor-neutral short-video options to MoneyPrinterTurbo's
 * `VideoParams` (POST /api/v1/videos) field names. Undefined options are omitted
 * so the worker keeps its own defaults.
 */
export function moneyPrinterParams(o: ShortVideoOptions | undefined): Record<string, unknown> {
  if (!o) return {};
  const p: Record<string, unknown> = {};
  if (o.aspect !== undefined) p.video_aspect = o.aspect;
  if (o.script !== undefined) p.video_script = o.script;
  if (o.terms !== undefined) p.video_terms = o.terms;
  if (o.clipDuration !== undefined) p.video_clip_duration = o.clipDuration;
  if (o.count !== undefined) p.video_count = o.count;
  if (o.source !== undefined) p.video_source = o.source;
  if (o.concatMode !== undefined) p.video_concat_mode = o.concatMode;
  if (o.transition !== undefined) p.video_transition_mode = o.transition === 'none' ? null : o.transition;
  if (o.voiceName !== undefined) p.voice_name = o.voiceName;
  if (o.voiceVolume !== undefined) p.voice_volume = o.voiceVolume;
  if (o.voiceRate !== undefined) p.voice_rate = o.voiceRate;
  if (o.bgmType !== undefined) p.bgm_type = o.bgmType;
  if (o.bgmVolume !== undefined) p.bgm_volume = o.bgmVolume;
  if (o.subtitles !== undefined) p.subtitle_enabled = o.subtitles;
  if (o.subtitlePosition !== undefined) p.subtitle_position = o.subtitlePosition;
  if (o.fontName !== undefined) p.font_name = o.fontName;
  if (o.textColor !== undefined) p.text_fore_color = o.textColor;
  if (o.fontSize !== undefined) p.font_size = o.fontSize;
  if (o.strokeColor !== undefined) p.stroke_color = o.strokeColor;
  if (o.strokeWidth !== undefined) p.stroke_width = o.strokeWidth;
  if (o.paragraphs !== undefined) p.paragraph_number = o.paragraphs;
  return p;
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
    // mapped options first, then raw `extra` so an escape-hatch param wins.
    const body = { video_subject: req.subject, ...moneyPrinterParams(req.options), ...req.extra };
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
