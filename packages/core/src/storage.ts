export interface StoredObject {
  key: string;
  url: string;
}

export interface StoredBytes {
  data: Uint8Array;
  contentType: string;
}

export interface StorageDriver {
  /** Stores bytes under `key` and returns the stored object's key + retrievable url. */
  put(key: string, data: Uint8Array, contentType: string): Promise<StoredObject>;
  /** Retrieves stored bytes by key, or null if absent. */
  get(key: string): Promise<StoredBytes | null>;
  /** Deletes a stored object by key. No-op if absent. */
  delete?(key: string): Promise<void>;
  /** The url at which `key` can be retrieved. */
  url(key: string): string;
}
