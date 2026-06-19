export interface PublishRequest {
  content: string;
  channels?: string[];
  mediaUrls?: string[];
}

export interface PublishResult {
  postId: string;
  status: string;
  raw?: unknown;
}

export interface Publisher {
  readonly name: string;
  isAvailable(): boolean;
  publish(req: PublishRequest): Promise<PublishResult>;
}

export class PublishError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'PublishError';
  }
}
