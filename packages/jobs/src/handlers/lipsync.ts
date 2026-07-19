import {
  newAsset,
  type Job, type JobHandler, type JobOutcome, type ProgressReporter,
  type StorageDriver, type AssetRepo,
  type LipsyncProvider,
  type VoiceProvider,
} from '@forgecast/core';

export interface LipsyncJobHandlerDeps {
  provider: LipsyncProvider;
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
 * Lip-sync job handler: re-animates the mouth of an existing video to match a
 * new audio track (sync-lipsync or any LipsyncProvider).
 *
 * Accepts a pre-resolved audioUrl or a script (text + voice) that is voiced
 * on-the-fly with the injected voice provider — the same source-resolution
 * pattern as the presenter handler.
 */
export class LipsyncJobHandler implements JobHandler {
  readonly kind = 'lipsync';

  constructor(private readonly deps: LipsyncJobHandlerDeps) {}

  async run(job: Job, report: ProgressReporter): Promise<JobOutcome> {
    const params = job.params as {
      videoUrl?: unknown;
      audioUrl?: unknown;
      text?: unknown;
      voice?: unknown;
    };

    const wait = this.deps.wait ?? defaultWait;
    const interval = this.deps.pollIntervalMs ?? 4000;
    const maxPolls = this.deps.maxPolls ?? 450;
    const fetchFn = this.deps.fetchFn ?? fetch;

    if (!(typeof params.videoUrl === 'string' && params.videoUrl.length > 0)) {
      throw new Error('lipsync requires videoUrl');
    }
    const videoUrl = params.videoUrl;

    // ── 1. Resolve audio URL ───────────────────────────────────────────────
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
      throw new Error('lipsync requires text or audioUrl');
    }
    await report(0.3);

    // ── 2. Submit to the lipsync provider and poll ─────────────────────────
    const { taskId } = await this.deps.provider.create({ videoUrl, audioUrl });

    let resultUrl: string | undefined;
    for (let i = 0; i < maxPolls; i += 1) {
      const task = await this.deps.provider.getTask(taskId);
      await report(0.6);
      if (task.state === 'failed') throw new Error(`lipsync provider reported failure for task ${taskId}`);
      if (task.state === 'complete') { resultUrl = task.videoUrl; break; }
      await wait(interval);
    }
    if (!resultUrl) throw new Error(`lipsync task ${taskId} did not complete in time`);
    await report(0.9);

    // ── 3. Download, store, record asset ───────────────────────────────────
    const res = await fetchFn(resultUrl);
    if (!res.ok) throw new Error(`failed to download lipsynced video (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());

    const id = this.deps.idGen();
    const key = `projects/${job.projectId}/videos/${id}.mp4`;
    const stored = await this.deps.storage.put(key, bytes, 'video/mp4');

    const asset = await this.deps.assets.create(
      newAsset(
        { projectId: job.projectId, type: 'video', provider: this.deps.provider.name, storageKey: stored.key, params: job.params },
        { id, now: this.deps.clock() },
      ),
    );
    return { assetId: asset.id };
  }
}
