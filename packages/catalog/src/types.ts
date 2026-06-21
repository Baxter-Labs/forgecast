export interface CatalogModel {
  id: string;
  name: string;
  category: 'image';
  /** Allowed aspect ratios, when the upstream model declares them (else []). */
  aspectRatios: string[];
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
