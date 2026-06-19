export interface CatalogModel {
  id: string;
  name: string;
  category: 'image';
  /** Allowed aspect ratios, when the upstream model declares them (else []). */
  aspectRatios: string[];
}
