import { randomUUID } from 'node:crypto';

export function randomId(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
