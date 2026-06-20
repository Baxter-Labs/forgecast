import type { VoiceActions } from './vapi';
import type { Services } from '../forgecast';
import { ContentAgent } from '@forgecast/agent';
import { makeForgecastActions } from '../agent/forgecast-actions';
import { OpenAiLlmClient } from '../agent/llm';
import { maybeTrendTool } from '../agent/trends';

export function makeVoiceActions(services: Services): VoiceActions {
  return {
    async createContent({ brief, platforms, publish }) {
      if (!brief || brief.trim().length === 0) return 'Please tell me what content you want to create.';
      const llm = new OpenAiLlmClient();
      if (!llm.isAvailable()) return 'The content agent is not configured yet. Set OPENAI_API_KEY to enable planning.';
      const agent = new ContentAgent({ llm, forgecast: makeForgecastActions(services), trends: maybeTrendTool() });
      const plan = await agent.plan(brief, platforms ?? ['instagram']);
      const result = await agent.execute(plan, { publish: Boolean(publish) });
      const parts = [`I planned "${plan.concept}".`];
      if (result.assetIds.length) parts.push(`Generated ${result.assetIds.length} image asset${result.assetIds.length > 1 ? 's' : ''}.`);
      if (result.videoJobIds.length) parts.push(`Started ${result.videoJobIds.length} video render${result.videoJobIds.length > 1 ? 's' : ''}.`);
      if (result.montageJobId) parts.push('Stitched them into a montage video, now rendering.');
      if (result.published) parts.push(`Posted to ${plan.posts.map((p) => p.platform).join(', ')}.`);
      else if (publish) parts.push('Publishing was requested but a publisher is not configured.');
      return parts.join(' ');
    },
    async checkJob({ jobId }) {
      const job = await services.jobs.get(jobId);
      if (!job) return `I couldn't find a job with id ${jobId}.`;
      if (job.status === 'done') return `Job ${jobId} is done.`;
      if (job.status === 'error') return `Job ${jobId} failed: ${job.error ?? 'unknown error'}.`;
      return `Job ${jobId} is ${job.status}, ${Math.round((job.progress ?? 0) * 100)} percent.`;
    },
    async listProjects() {
      const projects = await services.projects.list();
      if (projects.length === 0) return 'You have no projects yet.';
      return `You have ${projects.length} project${projects.length > 1 ? 's' : ''}: ${projects.map((p) => p.name).join(', ')}.`;
    },
  };
}
