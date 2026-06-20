export interface VideoGenInput {
  prompt: string;
  aspectRatio?: string;
  duration?: number;
  quality?: string;
  model?: string;
}

export type VideoGenState = 'processing' | 'complete' | 'failed';

export interface VideoGenTask {
  taskId: string;
  state: VideoGenState;
  videoUrl?: string;
}

export interface VideoProvider {
  readonly name: string;
  isAvailable(): boolean;
  create(input: VideoGenInput): Promise<{ taskId: string }>;
  getTask(taskId: string): Promise<VideoGenTask>;
}
