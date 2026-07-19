export interface LipsyncGenInput {
  videoUrl: string;
  audioUrl: string;
}

export type LipsyncGenState = 'processing' | 'complete' | 'failed';

export interface LipsyncGenTask {
  taskId: string;
  state: LipsyncGenState;
  videoUrl?: string;
}

/**
 * Lip-syncs an existing video to a new audio track (the mouth is re-animated to
 * match the speech). Async queue contract, mirroring PresenterProvider.
 */
export interface LipsyncProvider {
  readonly name: string;
  isAvailable(): boolean;
  create(input: LipsyncGenInput): Promise<{ taskId: string }>;
  getTask(taskId: string): Promise<LipsyncGenTask>;
}
