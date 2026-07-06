/**
 * Sealed storage for user-supplied API keys (BYO keys set from the UI).
 *
 * With a secret (AUTH_SECRET on hosted deployments) values are encrypted
 * AES-256-GCM via WebCrypto — portable across Node and Workers, zero deps.
 * Without one (the open single-operator self-host mode) values are stored
 * base64-marked in the local database, the same trust domain as .env on the
 * same disk. Sealed strings are self-describing: `enc:iv.ct` or `plain:b64`.
 */

export interface StoredKey {
  ownerId: string;
  keyId: string;
  /** Sealed value (never the raw key). */
  value: string;
  updatedAt: string;
}

export interface KeyRepo {
  get(ownerId: string, keyId: string): Promise<StoredKey | null>;
  list(ownerId: string): Promise<StoredKey[]>;
  /** Insert or overwrite the (ownerId, keyId) pair. */
  set(key: StoredKey): Promise<void>;
  delete(ownerId: string, keyId: string): Promise<void>;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    // Explicit ArrayBuffer backing so the views satisfy DOM BufferSource in
    // consumers compiled with the DOM lib (TS 5.7 generic typed arrays).
    const bytes = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

// Return type inferred — naming CryptoKey would need the DOM lib, and core stays lib-agnostic.
async function aesKey(secret: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function sealSecret(plain: string, secret?: string): Promise<string> {
  if (!secret) return `plain:${toBase64Url(encoder.encode(plain))}`;
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), encoder.encode(plain));
  return `enc:${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ct))}`;
}

/** Unseals a stored value; null when the blob is malformed or fails authentication. */
export async function openSecret(stored: string, secret?: string): Promise<string | null> {
  if (stored.startsWith('plain:')) {
    const raw = fromBase64Url(stored.slice(6));
    return raw ? decoder.decode(raw) : null;
  }
  if (stored.startsWith('enc:')) {
    if (!secret) return null;
    const dot = stored.indexOf('.', 4);
    if (dot < 0) return null;
    const iv = fromBase64Url(stored.slice(4, dot));
    const ct = fromBase64Url(stored.slice(dot + 1));
    if (!iv || !ct || iv.length !== 12) return null;
    try {
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await aesKey(secret), ct);
      return decoder.decode(pt);
    } catch {
      return null; // wrong secret or tampered ciphertext
    }
  }
  return null;
}

/** A safe display preview: the last 4 characters only (never the key). */
export function maskKey(value: string): string {
  const tail = value.slice(-4);
  return `••••${tail}`;
}
