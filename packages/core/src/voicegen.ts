export interface VoiceGenInput {
  text: string;
  voice?: string;
  model?: string;
}

export type VoiceGenState = 'processing' | 'complete' | 'failed';

export interface VoiceGenTask {
  taskId: string;
  state: VoiceGenState;
  audioUrl?: string;
}

export interface VoiceProvider {
  readonly name: string;
  isAvailable(): boolean;
  create(input: VoiceGenInput): Promise<{ taskId: string }>;
  getTask(taskId: string): Promise<VoiceGenTask>;
}
