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
  aspectRatios: string[];
}
