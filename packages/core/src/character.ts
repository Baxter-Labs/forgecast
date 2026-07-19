/**
 * Characters — persistent, reusable identities (the "cast"). A character is
 * created once from 1–4 reference portraits and can then appear consistently
 * across image generations, image-to-video, and the talking-head presenter
 * (the Higgsfield-Soul-ID / LTX-Elements pattern, built reference-based: no
 * face-swapping onto third-party footage, only generation conditioned on
 * references the user uploaded).
 *
 * Characters are OWNER-scoped (not project-scoped) so one cast member can star
 * in every project — reference bytes live in the shared StorageDriver.
 */

export type CharacterLoraStatus = 'training' | 'ready' | 'error';

export interface Character {
  id: string;
  ownerId: string;
  /** Display name, also woven into prompts ("…featuring <name>"). */
  name: string;
  /** Storage keys of the 1–4 reference portraits. */
  refKeys: string[];
  /** Optional persona notes appended to prompts (age, wardrobe, vibe). */
  description?: string;
  /**
   * Trained-identity tier ("Soul-ID"): an optional LoRA fine-tuned on the
   * reference portraits. When ready, generations load the LoRA instead of
   * conditioning on reference images, so identity holds under bigger
   * scene/pose/lighting changes.
   */
  loraUrl?: string;
  loraStatus?: CharacterLoraStatus;
  /** Provider task reference while training (internal; cleared on completion). */
  loraTaskId?: string;
  createdAt: string;
}

export const MAX_CHARACTER_REFS = 4;

/** LoRA fields settable after creation (an explicit undefined clears the field). */
export type CharacterLoraPatch = Partial<Pick<Character, 'loraUrl' | 'loraStatus' | 'loraTaskId'>>;

export interface CharacterRepo {
  create(character: Character): Promise<Character>;
  get(id: string): Promise<Character | null>;
  listByOwner(ownerId: string): Promise<Character[]>;
  update(id: string, patch: CharacterLoraPatch): Promise<Character | null>;
  delete(id: string): Promise<void>;
}

// ── LoRA training — provider-agnostic contract (submit → poll, like VideoProvider) ──

export type LoraTrainState = 'processing' | 'complete' | 'failed';

export interface LoraTrainInput {
  /** URL (or data URI) of a ZIP archive of the training images. */
  imagesDataUrl: string;
  /** Token woven into prompts to summon the trained identity. */
  triggerWord?: string;
  steps?: number;
}

export interface LoraTrainTask {
  taskId: string;
  state: LoraTrainState;
  /** Set when state is 'complete': the trained LoRA weights file. */
  loraUrl?: string;
}

export interface LoraTrainer {
  readonly name: string;
  isAvailable(): boolean;
  create(input: LoraTrainInput): Promise<{ taskId: string }>;
  getTask(taskId: string): Promise<LoraTrainTask>;
}
