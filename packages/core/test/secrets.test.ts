import { describe, it, expect } from 'vitest';
import { sealSecret, openSecret, maskKey } from '../src/secrets';

const SECRET = 'auth-secret-32-bytes-long-enough!!';

describe('sealed secrets', () => {
  it('round-trips under a secret (AES-GCM) with a fresh IV per seal', async () => {
    const a = await sealSecret('sk-fal-12345', SECRET);
    const b = await sealSecret('sk-fal-12345', SECRET);
    expect(a).toMatch(/^enc:/);
    expect(a).not.toBe(b); // random IV
    expect(await openSecret(a, SECRET)).toBe('sk-fal-12345');
    expect(await openSecret(b, SECRET)).toBe('sk-fal-12345');
  });

  it('fails closed on the wrong secret or a tampered blob', async () => {
    const sealed = await sealSecret('sk-fal-12345', SECRET);
    expect(await openSecret(sealed, 'a-different-secret-entirely!!')).toBeNull();
    const tampered = sealed.slice(0, -3) + (sealed.endsWith('AAA') ? 'BBB' : 'AAA');
    expect(await openSecret(tampered, SECRET)).toBeNull();
    expect(await openSecret('enc:garbage', SECRET)).toBeNull();
    expect(await openSecret('not-a-sealed-value', SECRET)).toBeNull();
  });

  it('falls back to marked plaintext without a secret (open self-host mode)', async () => {
    const sealed = await sealSecret('sk-local-999');
    expect(sealed).toMatch(/^plain:/);
    expect(sealed).not.toContain('sk-local-999'); // at least not raw in the blob
    expect(await openSecret(sealed)).toBe('sk-local-999');
  });

  it('an enc: blob is unreadable when the secret is missing', async () => {
    const sealed = await sealSecret('sk-fal-12345', SECRET);
    expect(await openSecret(sealed)).toBeNull();
  });

  it('maskKey shows only the tail', () => {
    expect(maskKey('sk-abcdef123456')).toBe('••••3456');
    expect(maskKey('abcd')).toBe('••••abcd');
  });
});
