import { openDatabase } from './db';
import { SqliteProjectRepo } from './projectRepo';
import { SqliteAssetRepo } from './assetRepo';
import { SqliteJobRepo } from './jobRepo';

export interface SqliteStore {
  projects: SqliteProjectRepo;
  assets: SqliteAssetRepo;
  jobs: SqliteJobRepo;
  close(): void;
}

export function openStore(path: string): SqliteStore {
  const db = openDatabase(path);
  return {
    projects: new SqliteProjectRepo(db),
    assets: new SqliteAssetRepo(db),
    jobs: new SqliteJobRepo(db),
    close: () => db.close(),
  };
}
