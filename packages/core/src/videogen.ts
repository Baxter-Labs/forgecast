export interface VideoGenInput {
  prompt: string;
  aspectRatio?: string;
  duration?: number;
  quality?: string;
  model?: string;
  /** Source image URL for image-to-video models. */
  imageUrl?: string;
  /** Extra model-specific params merged into the fal request body. */
  extra?: Record<string, unknown>;
}

export type VideoGenState = 'processing' | 'complete' | 'failed';

export interface VideoGenTask {
  taskId: string;
  state: VideoGenState;
  videoUrl?: string;
  error?: string;
}

export interface VideoProvider {
  readonly name: string;
  isAvailable(): boolean;
  create(input: VideoGenInput): Promise<{ taskId: string }>;
  getTask(taskId: string): Promise<VideoGenTask>;
}
