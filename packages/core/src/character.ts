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

export interface Character {
  id: string;
  ownerId: string;
  /** Display name, also woven into prompts ("…featuring <name>"). */
  name: string;
  /** Storage keys of the 1–4 reference portraits. */
  refKeys: string[];
  /** Optional persona notes appended to prompts (age, wardrobe, vibe). */
  description?: string;
  createdAt: string;
}

export const MAX_CHARACTER_REFS = 4;

export interface CharacterRepo {
  create(character: Character): Promise<Character>;
  get(id: string): Promise<Character | null>;
  listByOwner(ownerId: string): Promise<Character[]>;
  delete(id: string): Promise<void>;
}
