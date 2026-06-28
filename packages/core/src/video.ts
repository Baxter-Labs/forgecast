/**
 * Vendor-neutral knobs for a MoneyPrinterTurbo-style short video: a topic →
 * LLM script → stock footage → TTS narration → burned-in styled captions →
 * background music → a finished vertical clip. The worker adapter maps these to
 * its own request params, so callers stay decoupled from the engine.
 */
export interface ShortVideoOptions {
  /** Output shape — `9:16` (default, vertical for Shorts/Reels/TikTok), `16:9`, or `1:1`. */
  aspect?: '9:16' | '16:9' | '1:1';
  /** Provide your own narration script (skips LLM script generation). */
  script?: string;
  /** Stock-footage search terms (else derived from the subject). */
  terms?: string[];
  /** Seconds of footage per clip before switching (default ~5). */
  clipDuration?: number;
  /** How many videos to render from this subject in one go (batch). */
  count?: number;
  /** Stock-footage source: `pexels` (default), `pixabay`, or `local`. */
  source?: 'pexels' | 'pixabay' | 'local';
  /** Clip ordering: `random` (default) or `sequential`. */
  concatMode?: 'random' | 'sequential';
  /** Between-clip transition. */
  transition?: 'none' | 'Shuffle' | 'FadeIn' | 'FadeOut' | 'SlideIn' | 'SlideOut';
  /** TTS voice name (worker default when blank). */
  voiceName?: string;
  voiceVolume?: number;
  voiceRate?: number;
  /** Background music: `random` (default), `''` for none, or a filename. */
  bgmType?: string;
  bgmVolume?: number;
  /** Burn styled captions into the video (default true) — the signature short-video look. */
  subtitles?: boolean;
  subtitlePosition?: 'top' | 'center' | 'bottom' | 'custom';
  fontName?: string;
  /** Caption text color (hex). */
  textColor?: string;
  fontSize?: number;
  /** Caption outline color (hex). */
  strokeColor?: string;
  strokeWidth?: number;
  /** Script length as a paragraph count (1–10). */
  paragraphs?: number;
}

export interface ShortVideoRequest {
  subject: string;
  options?: ShortVideoOptions;
  /** Escape hatch: raw worker params, merged last (overrides mapped options). */
  extra?: Record<string, unknown>;
}

export type VideoTaskState = 'processing' | 'complete' | 'failed';

export interface ShortVideoTask {
  taskId: string;
  state: VideoTaskState;
  progress: number;
  videoUrl?: string;
}

export interface ShortVideoWorker {
  readonly name: string;
  isAvailable(): boolean;
  createVideo(req: ShortVideoRequest): Promise<{ taskId: string }>;
  getTask(taskId: string): Promise<ShortVideoTask>;
}
