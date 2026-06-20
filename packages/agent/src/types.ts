export interface ContentPlanItem {
  kind: 'image' | 'video';
  prompt: string;
  aspectRatio?: string;
}

export interface PlatformPost {
  platform: string;
  caption: string;
}

/** Optional directive: after generating the plan's assets, stitch them into one longer-form montage video. */
export interface MontagePlan {
  /** Aspect ratio for the stitched montage (defaults to 9:16 downstream). */
  aspectRatio?: string;
}

export interface ContentPlan {
  concept: string;
  trendingNotes?: string;
  assets: ContentPlanItem[];
  posts: PlatformPost[];
  /** When present, the generated image assets are stitched into a single montage video. */
  montage?: MontagePlan;
}

export interface ExecutionResult {
  projectId: string;
  assetIds: string[];
  videoJobIds: string[];
  /** Job id of the montage render, when the plan requested one and assets were available. */
  montageJobId?: string;
  published: { postId: string; status: string } | null;
}

/** Abstracts the LLM (Codex / OpenAI / Claude). Inject a mock in tests; a real client in production. */
export interface LlmClient {
  complete(input: { system: string; user: string }): Promise<string>;
}

/** Trend intelligence (e.g. Agent-Reach). Returns a short summary of what's trending. */
export interface TrendTool {
  trending(topic: string, platform: string): Promise<string>;
}

/** The Forgecast actions the agent can take (implemented over the spine in apps/web). */
export interface ForgecastActions {
  ensureProject(name: string): Promise<string>;
  generateImage(projectId: string, prompt: string, aspectRatio?: string): Promise<{ assetId: string | null }>;
  generateVideo(projectId: string, prompt: string, aspectRatio?: string): Promise<{ jobId: string }>;
  generateMontage(projectId: string, assetIds: string[], aspectRatio?: string): Promise<{ jobId: string }>;
  publish(assetId: string, content: string, channels?: string[]): Promise<{ postId: string; status: string }>;
}
