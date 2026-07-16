import type { VideoGenTask } from './videogen';

/**
 * Cinematic camera-motion presets, rendered as per-frame 2D transforms over the
 * scene media (the zero-GPU "virtual camera"). The catalog covers the classic
 * moves that read well on stills — the 3D ones (orbit, FPV) need a real video
 * model and are deliberately not faked here.
 */
export type CameraPreset =
  | 'none'
  | 'zoom-in'
  | 'zoom-out'
  | 'crash-zoom'
  | 'pan-left'
  | 'pan-right'
  | 'dutch'
  | 'handheld';

export const CAMERA_PRESETS: readonly CameraPreset[] = [
  'none', 'zoom-in', 'zoom-out', 'crash-zoom', 'pan-left', 'pan-right', 'dutch', 'handheld',
];

export interface MontageScene {
  /** Public URL of the scene asset (image or video) the worker can fetch. */
  url: string;
  kind: 'image' | 'video';
  durationSec: number;
  caption?: string;
  transition?: 'fade' | 'slide' | 'none';
  /** Camera motion applied across the scene's duration (default: none). */
  cameraPreset?: CameraPreset;
}

export interface MontageSpec {
  scenes: MontageScene[];
  aspectRatio: string; // '16:9' | '9:16' | '1:1'
  fps?: number;
  /** @deprecated Never rendered by the worker. Synthesize upstream and pass `voiceoverUrl` instead. */
  voiceoverText?: string;
  /** Public URL of a narration audio track. Rendered alongside `musicUrl` (music is ducked). */
  voiceoverUrl?: string;
  musicUrl?: string;
}

/** A worker that renders a MontageSpec into a longer-form video (e.g. Remotion). Async: render → poll. */
export interface MontageWorker {
  readonly name: string;
  isAvailable(): boolean;
  render(spec: MontageSpec): Promise<{ taskId: string }>;
  getTask(taskId: string): Promise<VideoGenTask>;
}
