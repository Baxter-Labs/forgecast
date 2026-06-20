import type { VideoGenTask } from './videogen';

export interface MontageScene {
  /** Public URL of the scene asset (image or video) the worker can fetch. */
  url: string;
  kind: 'image' | 'video';
  durationSec: number;
  caption?: string;
  transition?: 'fade' | 'slide' | 'none';
}

export interface MontageSpec {
  scenes: MontageScene[];
  aspectRatio: string; // '16:9' | '9:16' | '1:1'
  fps?: number;
  voiceoverText?: string;
  musicUrl?: string;
}

/** A worker that renders a MontageSpec into a longer-form video (e.g. Remotion). Async: render → poll. */
export interface MontageWorker {
  readonly name: string;
  isAvailable(): boolean;
  render(spec: MontageSpec): Promise<{ taskId: string }>;
  getTask(taskId: string): Promise<VideoGenTask>;
}
