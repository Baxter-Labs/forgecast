import { openDatabase } from './db';
import { SqliteProjectRepo } from './projectRepo';
import { SqliteAssetRepo } from './assetRepo';
import { SqliteJobRepo } from './jobRepo';
import { SqliteUserRepo } from './userRepo';
import { SqliteKeyRepo } from './keyRepo';
import { SqliteCharacterRepo } from './characterRepo';

export interface SqliteStore {
  projects: SqliteProjectRepo;
  assets: SqliteAssetRepo;
  jobs: SqliteJobRepo;
  users: SqliteUserRepo;
  keys: SqliteKeyRepo;
  characters: SqliteCharacterRepo;
  close(): void;
}

export function openStore(path: string): SqliteStore {
  const db = openDatabase(path);
  return {
    projects: new SqliteProjectRepo(db),
    assets: new SqliteAssetRepo(db),
    jobs: new SqliteJobRepo(db),
    users: new SqliteUserRepo(db),
    keys: new SqliteKeyRepo(db),
    characters: new SqliteCharacterRepo(db),
    close: () => db.close(),
  };
}
