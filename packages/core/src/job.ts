import type { Job, JobKind } from './types';

export interface NewJobInput {
  projectId: string;
  kind: JobKind;
  provider: string;
  params?: Record<string, unknown>;
}

export interface NewJobDeps {
  id: string;
  now: string;
}

export function newJob(input: NewJobInput, deps: NewJobDeps): Job {
  return {
    id: deps.id,
    projectId: input.projectId,
    kind: input.kind,
    provider: input.provider,
    params: input.params ?? {},
    status: 'queued',
    progress: 0,
    createdAt: deps.now,
    updatedAt: deps.now,
  };
}
