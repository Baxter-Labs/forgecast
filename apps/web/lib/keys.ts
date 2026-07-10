import { maskKey, openSecret, sealSecret } from '@forgecast/core';
import type { Services } from './forgecast';
import type { ApiResult } from './api';

/**
 * BYO provider keys, managed from the UI. Stored sealed (AES-GCM under
 * AUTH_SECRET when set) per owner — the signed-in user on a hosted deployment,
 * or the implicit 'local' operator in the open self-host mode. Resolution
 * order everywhere: the owner's key → the instance env var.
 *
 * Only ids in this whitelist can ever be stored, and values never leave the
 * server — the API returns masked previews only.
 */

export type KeyId = 'fal' | 'fal_video' | 'fal_voice' | 'openai' | 'anthropic' | 'replicate' | 'pexels' | 'wisprflow';

export interface KeyDef {
  id: KeyId;
  label: string;
  group: 'Generation' | 'Agent brain' | 'Extras';
  env: string;
  hint: string;
}

export const KEY_CATALOG: readonly KeyDef[] = [
  { id: 'fal', label: 'fal.ai — images', env: 'FAL_KEY', group: 'Generation', hint: 'image generation + enhance/edit/cutout (Nano Banana, FLUX) · fal.ai/dashboard/keys' },
  { id: 'fal_video', label: 'fal.ai — video', env: 'FAL_KEY_VIDEO', group: 'Generation', hint: 'text→video and image→video (Seedance, Veo 3.1, Kling) + the AI presenter' },
  { id: 'fal_voice', label: 'fal.ai — voice', env: 'FAL_KEY_VOICE', group: 'Generation', hint: 'cloud TTS fallback — optional when self-hosted VoxCPM-2 is running (falls back to the image key)' },
  { id: 'replicate', label: 'Replicate — video', env: 'REPLICATE_API_TOKEN', group: 'Generation', hint: 'non-fal video generation (used when no fal video key is set) · replicate.com/account/api-tokens' },
  { id: 'openai', label: 'OpenAI', env: 'OPENAI_API_KEY', group: 'Agent brain', hint: 'the PLAN / AUTO-RUN + editor agent (default brain) — and non-fal image generation (gpt-image-1)' },
  { id: 'anthropic', label: 'Anthropic (Claude)', env: 'ANTHROPIC_API_KEY', group: 'Agent brain', hint: 'agent brain when FORGECAST_AGENT_LLM=anthropic' },
  { id: 'pexels', label: 'Pexels', env: 'PEXELS_API_KEY', group: 'Extras', hint: 'real stock-footage search (free key at pexels.com/api)' },
  { id: 'wisprflow', label: 'Wispr Flow', env: 'WISPRFLOW_API_KEY', group: 'Extras', hint: 'voice input in the agent chat (browser speech works without it)' },
];

const BY_ID = new Map(KEY_CATALOG.map((d) => [d.id, d]));
const MAX_KEY_LENGTH = 500;

const sealingSecret = (): string | undefined => process.env.AUTH_SECRET;

export interface KeyStatus {
  id: KeyId;
  label: string;
  group: KeyDef['group'];
  hint: string;
  /** Where the effective key comes from: the owner's own, the instance env, or nowhere. */
  source: 'user' | 'instance' | 'none';
  /** Masked tail of the owner's key (only when source is 'user'). */
  preview?: string;
}

/** Unseal all of an owner's keys → { keyId: plainValue }. Unreadable blobs are skipped. */
export async function resolveOwnerKeys(services: Services, ownerId: string): Promise<Partial<Record<KeyId, string>>> {
  const stored = await services.keys.list(ownerId);
  const out: Partial<Record<KeyId, string>> = {};
  for (const row of stored) {
    if (!BY_ID.has(row.keyId as KeyId)) continue;
    const value = await openSecret(row.value, sealingSecret());
    if (value) out[row.keyId as KeyId] = value;
  }
  return out;
}

export async function listKeyStatuses(services: Services, ownerId: string): Promise<ApiResult> {
  const own = await resolveOwnerKeys(services, ownerId);
  const keys: KeyStatus[] = KEY_CATALOG.map((def) => {
    const mine = own[def.id];
    if (mine) return { id: def.id, label: def.label, group: def.group, hint: def.hint, source: 'user', preview: maskKey(mine) };
    return {
      id: def.id,
      label: def.label,
      group: def.group,
      hint: def.hint,
      source: process.env[def.env] ? 'instance' : 'none',
    };
  });
  return { status: 200, body: { keys, sealed: Boolean(sealingSecret()) } };
}

export async function setUserKey(services: Services, ownerId: string, input: unknown): Promise<ApiResult> {
  const fields = (input ?? {}) as { id?: unknown; value?: unknown };
  const id = typeof fields.id === 'string' ? (fields.id as KeyId) : undefined;
  if (!id || !BY_ID.has(id)) return { status: 400, body: { error: 'unknown key id' } };
  const value = typeof fields.value === 'string' ? fields.value.trim() : '';
  if (!value) return { status: 400, body: { error: 'value is required (use DELETE to clear)' } };
  if (value.length > MAX_KEY_LENGTH || /[\r\n]/.test(value)) return { status: 400, body: { error: 'that does not look like an API key' } };

  await services.keys.set({ ownerId, keyId: id, value: await sealSecret(value, sealingSecret()), updatedAt: services.ids.nowIso() });
  return listKeyStatuses(services, ownerId);
}

export async function clearUserKey(services: Services, ownerId: string, input: unknown): Promise<ApiResult> {
  const fields = (input ?? {}) as { id?: unknown };
  const id = typeof fields.id === 'string' ? (fields.id as KeyId) : undefined;
  if (!id || !BY_ID.has(id)) return { status: 400, body: { error: 'unknown key id' } };
  await services.keys.delete(ownerId, id);
  return listKeyStatuses(services, ownerId);
}
