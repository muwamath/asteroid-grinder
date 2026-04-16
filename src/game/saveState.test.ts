import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import {
  serialize,
  deserialize,
  saveToLocalStorage,
  loadFromLocalStorage,
  STORAGE_KEY,
  type SaveStateV1,
} from './saveState';

// Minimal localStorage polyfill for node env (vitest default). Always
// install our own — node 22's partial Storage shim lacks `clear`/`key`.
beforeAll(() => {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
});

const sample: SaveStateV1 = {
  v: 1,
  cash: 123,
  levels: { sawDamage: 2, dropRate: 1 },
  weaponCounts: { saw: 1 },
  sawClockwise: true,
  emaCashPerSec: 4.5,
  savedAt: 1_700_000_000_000,
};

describe('saveState', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips via serialize/deserialize', () => {
    expect(deserialize(serialize(sample))).toEqual(sample);
  });

  it('returns null for malformed JSON', () => {
    expect(deserialize('not json')).toBeNull();
  });

  it('returns null for wrong version', () => {
    expect(deserialize(JSON.stringify({ ...sample, v: 2 }))).toBeNull();
  });

  it('returns null for missing required key', () => {
    const { cash: _cash, ...rest } = sample;
    void _cash;
    expect(deserialize(JSON.stringify(rest))).toBeNull();
  });

  it('returns null for wrong type on a key', () => {
    expect(deserialize(JSON.stringify({ ...sample, cash: 'lots' }))).toBeNull();
  });

  it('saves and loads via localStorage', () => {
    saveToLocalStorage(sample);
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();
    expect(loadFromLocalStorage()).toEqual(sample);
  });

  it('loadFromLocalStorage returns null when empty', () => {
    expect(loadFromLocalStorage()).toBeNull();
  });
});
