export interface ContentPlanItem {
  kind: 'image' | 'video';
  prompt: string;
  aspectRatio?: string;
}

export interface PlatformPost {
  platform: string;
  caption: string;
}

/** Three unique video clips that get generated and stitched into one montage video. */
export interface MontageScene {
  prompt: string;
  aspectRatio?: string;
}

/** A montage: 3 unique video clips generated from their own prompts and then stitched together. */
export interface MontagePlan {
  aspectRatio?: string;
  /** The 3 unique clip prompts. Must have at least 2. */
  scenes: MontageScene[];
}

export interface ContentPlan {
  concept: string;
  trendingNotes?: string;
  /** Standalone images and videos that appear individually in the gallery. */
  assets: ContentPlanItem[];
  posts: PlatformPost[];
  /** When present, 3 unique video clips are generated from the scenes and stitched into a montage.
   *  The montage is separate from the assets list — scenes are NOT repeated in assets. */
  montage?: MontagePlan;
}

export interface ExecutionResult {
  projectId: string;
  assetIds: string[];
  videoJobIds: string[];
  /** Job id of the montage render, when the plan requested one and assets were available. */
  montageJobId?: string;
  /** Async job IDs for the montage clip videos (each one is a separate video clip). */
  montageJobIds?: string[];
  /** When montage clips were queued, signal the frontend to stitch them once polling completes. */
  pendingMontage?: { aspectRatio?: string };
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
  publish(assetId: string, content: string, channels?: string[]): Promise<{ postId: string; status: string }>;
}
