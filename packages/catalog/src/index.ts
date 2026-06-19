import rawData from '../data/openmodels-t2i.json';
import { parseImageModels } from './parse';

export * from './types';
export * from './parse';

/** The vendored text-to-image catalog, parsed and validated at module load. */
export const imageModels = parseImageModels(rawData);
