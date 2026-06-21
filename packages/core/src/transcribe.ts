export interface TranscribeInput {
  audioBase64Wav: string;
  language?: string[];
}

export interface TranscribeResult {
  text: string;
  detectedLanguage?: string;
}

export interface Transcriber {
  readonly name: string;
  isAvailable(): boolean;
  transcribe(input: TranscribeInput): Promise<TranscribeResult>;
}
