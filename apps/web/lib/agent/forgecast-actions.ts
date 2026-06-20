import type { ForgecastActions } from '@forgecast/agent';
import type { Services } from '../forgecast';
import { createProject, generateImage, generateMontage, generateVideo, publishAsset } from '../api';

const RATIO_TO_DIM: Record<string, { width: number; height: number }> = {
  '1:1': { width: 1024, height: 1024 },
  '16:9': { width: 1024, height: 576 },
  '9:16': { width: 576, height: 1024 },
  '4:3': { width: 1024, height: 768 },
  '3:4': { width: 768, height: 1024 },
};

export function makeForgecastActions(services: Services): ForgecastActions {
  return {
    async ensureProject(name: string): Promise<string> {
      const r = await createProject(services, { name });
      return (r.body as { project: { id: string } }).project.id;
    },
    async generateImage(projectId, prompt, aspectRatio) {
      const dim = aspectRatio ? RATIO_TO_DIM[aspectRatio] : undefined;
      const r = await generateImage(services, projectId, { prompt, ...(dim ?? {}) });
      const body = r.body as { asset?: { id: string } | null; job?: { status?: string; error?: string }; error?: string };
      const asset = body.asset;
      if (!asset) {
        // Surface why generation produced no asset (e.g. an invalid FAL key → 401),
        // instead of silently reporting "0 assets" to the agent.
        console.error(`[forgecast] image generation produced no asset: ${body.job?.error ?? body.error ?? `status ${r.status}`}`);
      }
      return { assetId: asset?.id ?? null };
    },
    async generateVideo(projectId, prompt, aspectRatio) {
      const r = await generateVideo(services, projectId, { prompt, aspectRatio });
      const job = (r.body as { job?: { id: string } }).job;
      return { jobId: job?.id ?? '' };
    },
    async generateMontage(projectId, assetIds, aspectRatio) {
      const r = await generateMontage(services, projectId, { assetIds, aspectRatio });
      const job = (r.body as { job?: { id: string } }).job;
      return { jobId: job?.id ?? '' };
    },
    async publish(assetId, content, channels) {
      const r = await publishAsset(services, assetId, { content, channels });
      const pub = (r.body as { published?: { postId: string; status: string } }).published;
      return pub ?? { postId: '', status: 'error' };
    },
  };
}
