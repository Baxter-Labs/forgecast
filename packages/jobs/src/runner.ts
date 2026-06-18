import type { Job, JobKind, JobHandler, JobRepo, ProgressReporter } from '@forgecast/core';

export class JobRunner {
  private readonly handlers: Map<JobKind, JobHandler>;

  constructor(
    private readonly jobs: JobRepo,
    handlers: JobHandler[],
  ) {
    this.handlers = new Map(handlers.map((h): [JobKind, JobHandler] => [h.kind, h]));
  }

  async run(jobId: string): Promise<Job> {
    const job = await this.jobs.get(jobId);
    if (!job) throw new Error(`Unknown job: ${jobId}`);

    const handler = this.handlers.get(job.kind);
    if (!handler) {
      return this.jobs.update(jobId, { status: 'error', error: `No handler for job kind: ${job.kind}` });
    }

    await this.jobs.update(jobId, { status: 'running', progress: 0 });
    const report: ProgressReporter = async (p) => {
      await this.jobs.update(jobId, { progress: p });
    };

    try {
      const outcome = await handler.run(job, report);
      return await this.jobs.update(jobId, { status: 'done', progress: 1, resultAssetId: outcome.assetId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return await this.jobs.update(jobId, { status: 'error', error: message });
    }
  }
}
