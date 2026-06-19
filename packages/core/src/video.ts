export interface ShortVideoRequest {
  subject: string;
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
