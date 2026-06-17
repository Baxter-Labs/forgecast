export interface StoredObject {
  key: string;
  url: string;
}

export interface StorageDriver {
  /** Stores bytes under `key` and returns the stored object's key + retrievable url. */
  put(key: string, data: Uint8Array, contentType: string): Promise<StoredObject>;
  /** The url at which `key` can be retrieved. */
  url(key: string): string;
}
