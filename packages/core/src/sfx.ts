export interface SfxGenInput {
  /** The video to score — sound is generated to match its visual content. */
  videoUrl: string;
  /** Describes the desired sound (e.g. "rain on a tin roof, distant thunder"). */
  prompt: string;
  /** Sounds to avoid (e.g. "music, speech"). */
  negativePrompt?: string;
}

export type SfxGenState = 'processing' | 'complete' | 'failed';

export interface SfxGenTask {
  taskId: string;
  state: SfxGenState;
  videoUrl?: string;
}

/**
 * SFX for video: generates synchronized sound effects / ambience for an
 * existing video and returns the video with the audio track merged in.
 * Async queue contract, mirroring LipsyncProvider/RetargetProvider.
 */
export interface SfxProvider {
  readonly name: string;
  isAvailable(): boolean;
  create(input: SfxGenInput): Promise<{ taskId: string }>;
  getTask(taskId: string): Promise<SfxGenTask>;
}
