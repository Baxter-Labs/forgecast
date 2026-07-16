import {
  newAsset,
  type Job, type JobHandler, type JobOutcome, type ProgressReporter,
  type StorageDriver, type AssetRepo, type VoiceProvider,
} from '@forgecast/core';

export interface VoiceoverJobHandlerDeps {
  provider: VoiceProvider;
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
 * Decodes a base64 `data:` URI to bytes. Synchronous TTS providers (Cloudflare
 * MeloTTS) hand audio back as a data URI, and Workers `fetch()` rejects the
 * `data:` scheme — so we decode inline instead of downloading.
 */
function bytesFromDataUri(uri: string): Uint8Array {
  const comma = uri.indexOf(',');
  if (comma === -1 || !uri.slice(0, comma).endsWith(';base64')) {
    throw new Error('unsupported data: URI audio (expected base64 encoding)');
  }
  const bin = atob(uri.slice(comma + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export class VoiceoverJobHandler implements JobHandler {
  readonly kind = 'voiceover';

  constructor(private readonly deps: VoiceoverJobHandlerDeps) {}

  async run(job: Job, report: ProgressReporter): Promise<JobOutcome> {
    const params = job.params as { text?: unknown; voice?: unknown; model?: unknown };
    if (typeof params.text !== 'string' || params.text.trim().length === 0) {
      throw new Error('voiceover job requires a non-empty "text" param');
    }

    const { taskId } = await this.deps.provider.create({
      text: params.text,
      voice: typeof params.voice === 'string' ? params.voice : undefined,
      model: typeof params.model === 'string' ? params.model : undefined,
    });
    await report(0.05);

    const wait = this.deps.wait ?? defaultWait;
    const interval = this.deps.pollIntervalMs ?? 4000;
    const maxPolls = this.deps.maxPolls ?? 150;

    let audioUrl: string | undefined;
    for (let i = 0; i < maxPolls; i += 1) {
      const task = await this.deps.provider.getTask(taskId);
      await report(0.5);
      if (task.state === 'failed') throw new Error(`voice provider reported failure for task ${taskId}`);
      if (task.state === 'complete') { audioUrl = task.audioUrl; break; }
      await wait(interval);
    }
    if (!audioUrl) throw new Error(`voice task ${taskId} did not complete in time`);

    let bytes: Uint8Array;
    if (audioUrl.startsWith('data:')) {
      bytes = bytesFromDataUri(audioUrl);
    } else {
      const fetchFn = this.deps.fetchFn ?? fetch;
      const res = await fetchFn(audioUrl);
      if (!res.ok) throw new Error(`failed to download generated audio (${res.status})`);
      bytes = new Uint8Array(await res.arrayBuffer());
    }

    const id = this.deps.idGen();
    const key = `projects/${job.projectId}/audio/${id}.mp3`;
    const stored = await this.deps.storage.put(key, bytes, 'audio/mpeg');
    await report(0.98);

    const asset = await this.deps.assets.create(
      newAsset({ projectId: job.projectId, type: 'audio', provider: job.provider, storageKey: stored.key, params: job.params }, { id, now: this.deps.clock() }),
    );
    return { assetId: asset.id };
  }
}
