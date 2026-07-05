import { openDatabase } from './db';
import { SqliteProjectRepo } from './projectRepo';
import { SqliteAssetRepo } from './assetRepo';
import { SqliteJobRepo } from './jobRepo';
import { SqliteUserRepo } from './userRepo';

export interface SqliteStore {
  projects: SqliteProjectRepo;
  assets: SqliteAssetRepo;
  jobs: SqliteJobRepo;
  users: SqliteUserRepo;
  close(): void;
}

export function openStore(path: string): SqliteStore {
  const db = openDatabase(path);
  return {
    projects: new SqliteProjectRepo(db),
    assets: new SqliteAssetRepo(db),
    jobs: new SqliteJobRepo(db),
    users: new SqliteUserRepo(db),
    close: () => db.close(),
  };
}
