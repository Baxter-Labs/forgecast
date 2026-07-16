import type { VideoProvider, VideoGenInput, VideoGenTask } from '@forgecast/core';

export interface HfSpacesVideoProviderOptions {
  /** A (free) Hugging Face token — raises ZeroGPU quota + queue priority. Falls back to HF_TOKEN. */
  token?: string;
  /** Space catalog key or host to use by default. Falls back to HF_SPACE, then the first catalog entry. */
  space?: string;
  /** getTask() bounded-read deadline in ms (the gradio result GET is a long-poll). */
  pollDeadlineMs?: number;
  /** Injectable fetch for testing. Defaults to global fetch. */
  fetchFn?: typeof fetch;
}

/** One hosted ZeroGPU Space and how to talk to it (fn names verified against /gradio_api/info). */
interface SpaceDef {
  key: string;
  host: string;
  /** Picks the endpoint for the input (t2v vs i2v). Returns null when unsupported. */
  fnFor(input: VideoGenInput): string | null;
  /** Builds the POSITIONAL gradio data array for the endpoint. */
  build(input: VideoGenInput): unknown[];
}

const NEGATIVE = 'worst quality, inconsistent motion, blurry, jittery, distorted';

/** LTX wants multiples of 32; these map Forgecast aspect ratios onto its grid. */
function ltxDims(aspectRatio: string | undefined): { h: number; w: number } {
  switch (aspectRatio) {
    case '16:9': return { h: 512, w: 704 };
    case '1:1': return { h: 512, w: 512 };
    case '9:16':
    default: return { h: 704, w: 512 };
  }
}

/** A remote file reference in gradio's FileData shape (the server fetches the URL). */
const fileData = (url: string): Record<string, unknown> => ({ url, meta: { _type: 'gradio.FileData' } });

const clampDuration = (d: number | undefined): number => Math.min(8, Math.max(1, d ?? 2));

/**
 * The built-in Space catalog. Each entry's endpoint signature was verified live
 * against `https://{host}/gradio_api/info` — re-verify there if a Space stops
 * working (owners can redeploy with different signatures at any time).
 */
const SPACES: readonly SpaceDef[] = [
  {
    // LTX-Video distilled (Lightricks) — fast t2v + i2v, returns in seconds.
    key: 'ltx-video-distilled',
    host: 'lightricks-ltx-video-distilled.hf.space',
    fnFor: (input) => (input.imageUrl ? '/image_to_video' : '/text_to_video'),
    build: (input) => {
      const { h, w } = ltxDims(input.aspectRatio);
      const mode = input.imageUrl ? 'image-to-video' : 'text-to-video';
      return [
        input.prompt,
        NEGATIVE,
        input.imageUrl ? fileData(input.imageUrl) : null, // input_image_filepath
        null,                                             // input_video_filepath
        h, w, mode,
        clampDuration(input.duration),
        9,    // ui_frames_to_use (video-to-video only; ignored here)
        42,   // seed
        true, // randomize_seed
        1,    // guidance_scale
      ];
    },
  },
  {
    // Wan 2.1 self-forcing (multimodalart) — image-to-video only.
    key: 'wan2-1-fast',
    host: 'multimodalart-wan2-1-fast.hf.space',
    fnFor: (input) => (input.imageUrl ? '/generate_video' : null),
    build: (input) => [
      input.imageUrl ? fileData(input.imageUrl) : null,
      input.prompt,
      512, 896,
      NEGATIVE,
      clampDuration(input.duration),
      1,    // guidance_scale
      4,    // steps
      42,   // seed
      true, // randomize_seed
    ],
  },
];

const TASK_PREFIX = 'hf::';

interface SseTerminal { event: 'complete' | 'error'; data: unknown }

/** Extracts the last terminal SSE event from a gradio result stream's text. */
function parseSse(text: string): SseTerminal | null {
  let current = '';
  let terminal: SseTerminal | null = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('event:')) current = line.slice(6).trim();
    else if (line.startsWith('data:') && (current === 'complete' || current === 'error')) {
      const raw = line.slice(5).trim();
      let data: unknown = null;
      try { data = JSON.parse(raw); } catch { data = raw; }
      terminal = { event: current, data };
    }
  }
  return terminal;
}

/** Digs the mp4 URL out of a gradio video FileData return (shape varies by component version). */
function videoUrlFrom(data: unknown, host: string): string | undefined {
  const first = Array.isArray(data) ? (data[0] as Record<string, unknown> | null) : null;
  if (!first || typeof first !== 'object') return undefined;
  const video = (first.video ?? first) as Record<string, unknown>;
  if (typeof video.url === 'string') return video.url;
  if (typeof video.path === 'string') return `https://${host}/gradio_api/file=${video.path}`;
  return undefined;
}

const QUOTA_HELP =
  'free GPU quota exhausted or anonymous access refused — add a FREE Hugging Face token ' +
  '(huggingface.co/settings/tokens) in Settings → Keys, wait for the daily quota to reset, ' +
  'or render a stills-reel montage instead (free, unlimited)';

/**
 * FREE, real-diffusion VIDEO generation via Hugging Face ZeroGPU Spaces (open
 * models — LTX-Video distilled, Wan 2.1 — hosted by HF/the community at no charge).
 *
 * Talks the raw gradio HTTP protocol with plain fetch (`@gradio/client` needs
 * node built-ins the Workers runtime lacks):
 *   POST https://{space}/gradio_api/call/{fn}  { data: [...] } → { event_id }
 *   GET  …/call/{fn}/{event_id}                → one-shot SSE long-poll
 *
 * Quotas are real: anonymous callers get ~2 GPU-min/day PER IP — useless behind
 * Cloudflare's shared egress (verified live: anon submits then errors). So this
 * provider requires a token by default; a FREE HF account token gives each user
 * their own ~5 GPU-min/day. Self-hosters who own their IP can opt into anonymous
 * calls with HF_SPACES_ALLOW_ANON=1.
 *
 * getTask() does a bounded read of the long-poll (the fast Spaces finish inside
 * one window); on deadline it reports 'processing' and the next poll re-attaches.
 */
export class HfSpacesVideoProvider implements VideoProvider {
  readonly name = 'hf-spaces';
  private readonly token: string | undefined;
  private readonly defaultSpace: string | undefined;
  private readonly pollDeadlineMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(opts: HfSpacesVideoProviderOptions = {}) {
    this.token = opts.token ?? process.env.HF_TOKEN;
    this.defaultSpace = opts.space ?? process.env.HF_SPACE;
    this.pollDeadlineMs = opts.pollDeadlineMs ?? 45_000;
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  isAvailable(): boolean {
    return Boolean(this.token) || process.env.HF_SPACES_ALLOW_ANON === '1';
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  private pickSpace(input: VideoGenInput): SpaceDef {
    const wanted = input.model ?? this.defaultSpace;
    const match = wanted ? SPACES.find((s) => s.key === wanted || s.host === wanted) : undefined;
    const candidates = match ? [match] : SPACES;
    const usable = candidates.find((s) => s.fnFor(input) !== null);
    if (!usable) {
      throw new Error(
        `no Hugging Face Space in the catalog supports this input (${input.imageUrl ? 'image' : 'text'}-to-video${wanted ? ` via '${wanted}'` : ''}) — ` +
          `known spaces: ${SPACES.map((s) => s.key).join(', ')}`,
      );
    }
    return usable;
  }

  async create(input: VideoGenInput): Promise<{ taskId: string }> {
    if (!this.isAvailable()) {
      throw new Error('Hugging Face Spaces video not configured — add a FREE HF token (huggingface.co/settings/tokens)');
    }
    const space = this.pickSpace(input);
    const fn = space.fnFor(input)!;
    const res = await this.fetchFn(`https://${space.host}/gradio_api/call${fn}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ data: space.build(input) }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 429 || /quota|exceeded/i.test(text)) throw new Error(QUOTA_HELP);
      throw new Error(`Hugging Face Space submit failed (${res.status}): ${text.slice(0, 300)}`);
    }
    const body = (await res.json()) as { event_id?: string };
    if (!body.event_id) throw new Error('Hugging Face Space response missing event_id');
    return { taskId: `${TASK_PREFIX}${space.host}::${fn}::${body.event_id}` };
  }

  async getTask(taskId: string): Promise<VideoGenTask> {
    if (!taskId.startsWith(TASK_PREFIX)) return { taskId, state: 'failed' };
    const [host, fn, eventId] = taskId.slice(TASK_PREFIX.length).split('::');
    if (!host || !fn || !eventId) return { taskId, state: 'failed' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.pollDeadlineMs);
    let text: string;
    try {
      const res = await this.fetchFn(`https://${host}/gradio_api/call${fn}/${eventId}`, {
        headers: { ...this.headers(), Accept: 'text/event-stream' },
        signal: controller.signal,
      });
      if (res.status === 404) {
        // The one-shot stream was already consumed (or expired) without us seeing
        // the terminal event — the render outcome is unrecoverable.
        return { taskId, state: 'failed', error: 'the Space discarded this render before its result was read — try again' };
      }
      if (!res.ok) return { taskId, state: 'processing' }; // transient — retry next poll
      text = await res.text(); // resolves when the server closes after a terminal event
    } catch {
      return { taskId, state: 'processing' }; // deadline hit mid-stream — retry
    } finally {
      clearTimeout(timer);
    }

    const terminal = parseSse(text);
    if (!terminal) return { taskId, state: 'processing' };
    if (terminal.event === 'error') {
      const msg = typeof terminal.data === 'string' && terminal.data && terminal.data !== 'null' ? terminal.data : '';
      const error = /quota|exceeded/i.test(msg) || msg === '' ? QUOTA_HELP : `Hugging Face Space error: ${msg.slice(0, 300)}`;
      return { taskId, state: 'failed', error };
    }
    const videoUrl = videoUrlFrom(terminal.data, host);
    if (!videoUrl) return { taskId, state: 'failed', error: 'the Space completed without returning a video URL' };
    return { taskId, state: 'complete', videoUrl };
  }
}
