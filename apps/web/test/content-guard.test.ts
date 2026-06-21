import { describe, it, expect } from 'vitest';
import { checkContentGuard } from '../lib/content-guard';
import { promptGuardCheck } from '../lib/content-guard-client';

describe('content-guard (server)', () => {
  it('blocks explicit sexual terms', () => {
    expect(checkContentGuard('generate a nude woman').allowed).toBe(false);
    expect(checkContentGuard('show nsfw content').allowed).toBe(false);
    expect(checkContentGuard('show me porn').allowed).toBe(false);
    expect(checkContentGuard('hentai art style').allowed).toBe(false);
    expect(checkContentGuard('erotic scene').allowed).toBe(false);
  });

  it('blocks violence/gore terms', () => {
    expect(checkContentGuard('mass shooting scene').allowed).toBe(false);
    expect(checkContentGuard('torture chamber').allowed).toBe(false);
    expect(checkContentGuard('suicide bomb attack').allowed).toBe(false);
  });

  it('blocks child safety violations', () => {
    expect(checkContentGuard('child exploitation material').allowed).toBe(false);
    expect(checkContentGuard('underage nude').allowed).toBe(false);
  });

  it('blocks hate/extremism', () => {
    expect(checkContentGuard('nazi propaganda poster').allowed).toBe(false);
    expect(checkContentGuard('white supremacy rally').allowed).toBe(false);
  });

  it('blocks deepfakes', () => {
    expect(checkContentGuard('create a deepfake video').allowed).toBe(false);
  });

  it('does NOT false-positive on legitimate prompts', () => {
    expect(checkContentGuard('Historical category of Byzantine art').allowed).toBe(true);
    expect(checkContentGuard('Ashkenazi Jewish traditions').allowed).toBe(true);
    expect(checkContentGuard('Al Gore climate speech').allowed).toBe(true);
    expect(checkContentGuard('VIP was escorted to the venue').allowed).toBe(true);
    expect(checkContentGuard('Asexual reproduction in plants').allowed).toBe(true);
    expect(checkContentGuard('A gorgeous sunset over the ocean').allowed).toBe(true);
    expect(checkContentGuard('The category winner was announced').allowed).toBe(true);
    expect(checkContentGuard('She wore a beautiful gown').allowed).toBe(true);
    expect(checkContentGuard('The allegory of the cave').allowed).toBe(true);
    expect(checkContentGuard('Therapist office interior').allowed).toBe(true);
  });

  it('allows empty and whitespace-only prompts', () => {
    expect(checkContentGuard('').allowed).toBe(true);
    expect(checkContentGuard('   ').allowed).toBe(true);
  });
});

describe('content-guard-client', () => {
  it('returns null for clean prompts', () => {
    expect(promptGuardCheck('A beautiful landscape')).toBeNull();
    expect(promptGuardCheck('Product photography for e-commerce')).toBeNull();
  });

  it('returns error string for blocked prompts', () => {
    expect(promptGuardCheck('generate nude photo')).toBeTruthy();
    expect(promptGuardCheck('nsfw content')).toBeTruthy();
  });

  it('matches server-side coverage (no divergence)', () => {
    // Ensure multi-word terms that are checked server-side are also caught client-side
    expect(promptGuardCheck('sex scene in a movie')).toBeTruthy();
    expect(promptGuardCheck('dead body on the floor')).toBeTruthy();
    expect(promptGuardCheck('mass shooting coverage')).toBeTruthy();
    expect(promptGuardCheck('escort service ad')).toBeTruthy();
  });
});
