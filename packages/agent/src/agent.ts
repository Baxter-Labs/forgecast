import type { ContentPlan, ExecutionResult, ForgecastActions, LlmClient, TrendTool } from './types';
import { PLAN_SYSTEM_PROMPT, buildPlanUserPrompt, parsePlan } from './plan';

export interface ContentAgentDeps {
  llm: LlmClient;
  forgecast: ForgecastActions;
  trends?: TrendTool;
}

export class ContentAgent {
  constructor(private readonly deps: ContentAgentDeps) {}

  /** Planning mode: brainstorm an on-trend content plan WITHOUT executing anything. */
  async plan(brief: string, platforms: string[]): Promise<ContentPlan> {
    let trendingNotes: string | undefined;
    if (this.deps.trends) {
      const notes = await Promise.all(
        platforms.map((p) => this.deps.trends!.trending(brief, p).catch(() => '')),
      );
      const joined = notes.filter((n) => n && n.trim()).join('\n');
      trendingNotes = joined.length > 0 ? joined : undefined;
    }
    const raw = await this.deps.llm.complete({
      system: PLAN_SYSTEM_PROMPT,
      user: buildPlanUserPrompt(brief, platforms, trendingNotes),
    });
    return parsePlan(raw);
  }

  /** Execute an approved plan: generate the assets, then (optionally) cast them. */
  async execute(plan: ContentPlan, opts: { projectName?: string; publish?: boolean } = {}): Promise<ExecutionResult> {
    const projectId = await this.deps.forgecast.ensureProject(opts.projectName ?? (plan.concept.slice(0, 60) || 'Forgecast'));

    const assetIds: string[] = [];
    const videoJobIds: string[] = [];
    for (const item of plan.assets) {
      if (item.kind === 'image') {
        const { assetId } = await this.deps.forgecast.generateImage(projectId, item.prompt, item.aspectRatio);
        if (assetId) assetIds.push(assetId);
      } else {
        const { jobId } = await this.deps.forgecast.generateVideo(projectId, item.prompt, item.aspectRatio);
        videoJobIds.push(jobId);
      }
    }

    let published: ExecutionResult['published'] = null;
    if (opts.publish && assetIds.length > 0 && plan.posts.length > 0) {
      const caption = plan.posts.map((p) => p.caption).find((c) => c && c.trim()) ?? plan.concept;
      const channels = plan.posts.map((p) => p.platform);
      published = await this.deps.forgecast.publish(assetIds[0]!, caption, channels);
    }

    return { projectId, assetIds, videoJobIds, published };
  }
}
