import { describe, expect, it } from 'vitest';
import {
  getProofStartUrl,
  parseProofResume,
  prepareProofResume,
  proofResumeKey,
} from '../utils/proof-resume.js';

const validState = 'state_abcdefghijklmnopqrstuvwxyz012345';

describe('proof resume', () => {
  it('accepts a valid, unexpired proof', () => {
    expect(
      parseProofResume(
        JSON.stringify({ state: validState, expiresAt: 2_000 }),
        1_000
      )
    ).toEqual({
      state: validState,
      expiresAt: 2_000,
    });
  });

  it('rejects malformed and expired proofs', () => {
    expect(parseProofResume('not-json')).toBeNull();
    expect(
      parseProofResume(
        JSON.stringify({ state: validState, expiresAt: 1_000 }),
        1_000
      )
    ).toBeNull();
  });

  it('builds a proof-start URL', () => {
    expect(getProofStartUrl('https://api.example.test/', validState)).toBe(
      `https://api.example.test/api/v001/auth/account-link-proof/start?state=${validState}`
    );
  });

  it('resumes proof state from the hash', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const result = prepareProofResume(
      'https://api.example.test/',
      `#state=${validState}&expiresAt=${Date.now() + 60_000}`,
      () => storage
    );

    expect(result.error).toBeNull();
    expect(result.url).toContain(
      `/api/v001/auth/account-link-proof/start?state=${validState}`
    );
    expect(values.has(proofResumeKey)).toBe(true);
  });

  it('preserves pending proof through reset and restarts the same login', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const pending = { state: 'a'.repeat(43), expiresAt: Date.now() + 600_000 };
    const hash =
      '#' +
      new URLSearchParams({
        state: pending.state,
        expiresAt: String(pending.expiresAt),
      }).toString();
    const initial = prepareProofResume(
      'https://api.example.test',
      hash,
      () => storage
    );

    expect(initial.error).toBeNull();
    expect(JSON.parse(values.get(proofResumeKey)!)).toEqual(pending);
    expect(
      prepareProofResume('https://api.example.test', '', () => storage)
    ).toEqual(initial);

    values.set(
      proofResumeKey,
      JSON.stringify({ ...pending, expiresAt: Date.now() - 1 })
    );
    const expired = prepareProofResume(
      'https://api.example.test',
      '',
      () => storage
    );
    expect(expired.url).toBeNull();
    expect(expired.error).toMatch(/expired/);
    expect(values.has(proofResumeKey)).toBe(false);
    expect(
      prepareProofResume('https://api.example.test', '', () => storage)
    ).toEqual({ url: 'https://api.example.test/api/v001/auth', error: null });
  });

  it('does not fall back to ordinary login when popup storage is blocked', () => {
    const result = prepareProofResume('https://api.example.test', '', () => {
      throw new Error('Storage blocked');
    });
    expect(result.url).toBeNull();
    expect(result.error).toMatch(/Allow browser storage/);
  });
});
