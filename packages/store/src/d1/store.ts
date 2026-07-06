import type { D1Like } from './db';
import { D1ProjectRepo } from './projectRepo';
import { D1AssetRepo } from './assetRepo';
import { D1JobRepo } from './jobRepo';
import { D1UserRepo } from './userRepo';
import { D1KeyRepo } from './keyRepo';

export interface D1Store {
  projects: D1ProjectRepo;
  assets: D1AssetRepo;
  jobs: D1JobRepo;
  users: D1UserRepo;
  keys: D1KeyRepo;
}

/** Builds the metadata repos backed by a Cloudflare D1 binding (edge-durable). */
export function d1Store(db: D1Like): D1Store {
  return {
    projects: new D1ProjectRepo(db),
    assets: new D1AssetRepo(db),
    jobs: new D1JobRepo(db),
    users: new D1UserRepo(db),
    keys: new D1KeyRepo(db),
  };
}
