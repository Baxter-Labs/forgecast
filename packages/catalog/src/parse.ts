import type { CatalogModel } from './types';

interface RawModel {
  id?: unknown;
  name?: unknown;
  inputs?: { aspect_ratio?: { enum?: unknown } };
}

export function parseImageModels(raw: unknown): CatalogModel[] {
  const t2i = (raw as { t2i?: unknown } | null)?.t2i;
  if (!Array.isArray(t2i)) return [];

  const models: CatalogModel[] = [];
  for (const entry of t2i as RawModel[]) {
    if (typeof entry?.id !== 'string' || typeof entry?.name !== 'string') continue;
    const enumVals = entry.inputs?.aspect_ratio?.enum;
    const aspectRatios = Array.isArray(enumVals)
      ? enumVals.filter((v): v is string => typeof v === 'string')
      : [];
    models.push({ id: entry.id, name: entry.name, category: 'image', aspectRatios });
  }
  return models;
}
