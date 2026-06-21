export interface PresenterGenInput {
  imageUrl: string;
  audioUrl: string;
}

export type PresenterGenState = 'processing' | 'complete' | 'failed';

export interface PresenterGenTask {
  taskId: string;
  state: PresenterGenState;
  videoUrl?: string;
}

export interface PresenterProvider {
  readonly name: string;
  isAvailable(): boolean;
  create(input: PresenterGenInput): Promise<{ taskId: string }>;
  getTask(taskId: string): Promise<PresenterGenTask>;
}
