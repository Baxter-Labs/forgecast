export interface CatalogModel {
  id: string;
  name: string;
  category: 'image';
  /** Allowed aspect ratios, when the upstream model declares them (else []). */
  aspectRatios: string[];
  /**
   * How the model expresses output size to fal:
   * - `aspect_ratio`: a ratio enum (Gemini / Nano Banana family) — send `aspect_ratio`.
   * - `image_size`: pixel dimensions (FLUX family) — send `image_size: { width, height }`.
   * Defaults to `image_size` when omitted.
   */
  sizing?: 'aspect_ratio' | 'image_size';
  /** Short descriptor shown in the UI. */
  note?: string;
}

export interface VideoModel {
  id: string;
  name: string;
  category: 'video';
  mode: 'text-to-video' | 'image-to-video';
  aspectRatios: string[];
  /** Native audio support (informational). */
  audio?: boolean;
  /** Short descriptor shown in the UI. */
  note?: string;
  /** Extra fal request-body params specific to this model (merged into the request). */
  params?: Record<string, unknown>;
}
