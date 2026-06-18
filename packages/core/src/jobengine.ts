import type { Job, JobKind } from './types';

export type ProgressReporter = (progress: number) => void | Promise<void>;

export interface JobOutcome {
  assetId: string;
}

export interface JobHandler {
  readonly kind: JobKind;
  run(job: Job, report: ProgressReporter): Promise<JobOutcome>;
}
