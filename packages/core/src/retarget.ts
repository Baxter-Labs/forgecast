export interface RetargetGenInput {
  /** The character to animate (a still image). */
  imageUrl: string;
  /** The reference performance video whose motion is retargeted onto the character. */
  videoUrl: string;
}

export type RetargetGenState = 'processing' | 'complete' | 'failed';

export interface RetargetGenTask {
  taskId: string;
  state: RetargetGenState;
  videoUrl?: string;
}

/**
 * Motion retargeting: drives a character image with the performance (body and
 * face motion) of a reference video. Async queue contract, mirroring
 * LipsyncProvider/PresenterProvider.
 */
export interface RetargetProvider {
  readonly name: string;
  isAvailable(): boolean;
  create(input: RetargetGenInput): Promise<{ taskId: string }>;
  getTask(taskId: string): Promise<RetargetGenTask>;
}
