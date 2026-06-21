import {
  newAsset,
  type Job, type JobHandler, type JobOutcome, type ProgressReporter,
  type StorageDriver, type AssetRepo,
  type PresenterProvider,
  type ImageProvider,
  type VoiceProvider,
} from '@forgecast/core';

export interface PresenterJobHandlerDeps {
  provider: PresenterProvider;
  imageProvider: ImageProvider;
  voiceProvider: VoiceProvider;
  storage: StorageDriver;
  assets: AssetRepo;
  idGen: () => string;
  clock: () => string;
  fetchFn?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  maxPolls?: number;
}

const defaultWait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Presenter job handler: generates a talking-head video by combining a portrait
 * image with a voice-over audio track via OmniHuman (or any PresenterProvider).
 *
 * Accepts either pre-generated URLs (imageUrl / audioUrl) or source inputs
 * (imagePrompt / text + voice) that are resolved on-the-fly using the injected
 * image and voice providers. Both fal-hosted URLs are forwarded directly to
 * OmniHuman — no file upload is required.
 */
export class PresenterJobHandler implements JobHandler {
  readonly kind = 'presenter';

  constructor(private readonly deps: PresenterJobHandlerDeps) {}

  async run(job: Job, report: ProgressReporter): Promise<JobOutcome> {
    const params = job.params as {
      imagePrompt?: unknown;
      imageUrl?: unknown;
      text?: unknown;
      audioUrl?: unknown;
      voice?: unknown;
    };

    const wait = this.deps.wait ?? defaultWait;
    const interval = this.deps.pollIntervalMs ?? 4000;
    const maxPolls = this.deps.maxPolls ?? 450;
    const fetchFn = this.deps.fetchFn ?? fetch;

    // ── 1. Resolve image URL ───────────────────────────────────────────────
    let imageUrl: string;
    if (typeof params.imageUrl === 'string' && params.imageUrl.length > 0) {
      imageUrl = params.imageUrl;
    } else if (typeof params.imagePrompt === 'string' && params.imagePrompt.length > 0) {
      const result = await this.deps.imageProvider.generateImage({ prompt: params.imagePrompt });
      imageUrl = result.url;
    } else {
      throw new Error('presenter requires imagePrompt or imageUrl');
    }
    await report(0.2);

    // ── 2. Resolve audio URL ───────────────────────────────────────────────
    let audioUrl: string;
    if (typeof params.audioUrl === 'string' && params.audioUrl.length > 0) {
      audioUrl = params.audioUrl;
    } else if (typeof params.text === 'string' && params.text.length > 0) {
      const voice = typeof params.voice === 'string' ? params.voice : undefined;
      const { taskId: voiceTaskId } = await this.deps.voiceProvider.create({ text: params.text, voice });

      let resolvedAudioUrl: string | undefined;
      const voiceMaxPolls = 150;
      for (let i = 0; i < voiceMaxPolls; i += 1) {
        const task = await this.deps.voiceProvider.getTask(voiceTaskId);
        if (task.state === 'failed') throw new Error(`voice generation failed for task ${voiceTaskId}`);
        if (task.state === 'complete') { resolvedAudioUrl = task.audioUrl; break; }
        await wait(interval);
      }
      if (!resolvedAudioUrl) throw new Error(`voice task ${voiceTaskId} did not complete in time`);
      audioUrl = resolvedAudioUrl;
    } else {
      throw new Error('presenter requires text or audioUrl');
    }
    await report(0.4);

    // ── 3. Submit to OmniHuman and poll ────────────────────────────────────
    const { taskId } = await this.deps.provider.create({ imageUrl, audioUrl });

    let videoUrl: string | undefined;
    for (let i = 0; i < maxPolls; i += 1) {
      const task = await this.deps.provider.getTask(taskId);
      await report(0.6);
      if (task.state === 'failed') throw new Error(`presenter provider reported failure for task ${taskId}`);
      if (task.state === 'complete') { videoUrl = task.videoUrl; break; }
      await wait(interval);
    }
    if (!videoUrl) throw new Error(`presenter task ${taskId} did not complete in time`);
    await report(0.9);

    // ── 4. Download, store, record asset ──────────────────────────────────
    const res = await fetchFn(videoUrl);
    if (!res.ok) throw new Error(`failed to download presenter video (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());

    const id = this.deps.idGen();
    const key = `projects/${job.projectId}/videos/${id}.mp4`;
    const stored = await this.deps.storage.put(key, bytes, 'video/mp4');

    const asset = await this.deps.assets.create(
      newAsset(
        { projectId: job.projectId, type: 'video', provider: 'omnihuman', storageKey: stored.key, params: job.params },
        { id, now: this.deps.clock() },
      ),
    );
    return { assetId: asset.id };
  }
}
