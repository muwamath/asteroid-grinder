import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import {
  serialize,
  deserialize,
  saveToLocalStorage,
  loadFromLocalStorage,
  STORAGE_KEY,
  STORAGE_KEY_V1,
  SAVE_STATE_VERSION,
  type SaveStateV2,
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

const sample: SaveStateV2 = {
  v: 2,
  cash: 123,
  levels: { sawDamage: 2, dropRate: 1 },
  weaponCounts: { saw: 1 },
  weaponInstances: [{ typeId: 'saw', x: 640, y: 500, clockwise: true }],
  emaCashPerSec: 4.5,
  savedAt: 1_700_000_000_000,
  runSeed: 'cosmic-dust-abc',
  pendingShardsThisRun: 0,
  prestigeShards: 0,
  prestigeCount: 0,
  prestigeShopLevels: {},
  instancesBoughtThisRun: {},
};

describe('saveState v2', () => {
  beforeEach(() => localStorage.clear());

  it('SAVE_STATE_VERSION is 2', () => {
    expect(SAVE_STATE_VERSION).toBe(2);
  });

  it('round-trips via serialize/deserialize', () => {
    expect(deserialize(serialize(sample))).toEqual(sample);
  });

  it('returns null for malformed JSON', () => {
    expect(deserialize('not json')).toBeNull();
  });

  it('returns null for wrong version (v > 2)', () => {
    expect(deserialize(JSON.stringify({ ...sample, v: 3 }))).toBeNull();
  });

  it('returns null for missing required key', () => {
    const { cash: _cash, ...rest } = sample;
    void _cash;
    expect(deserialize(JSON.stringify(rest))).toBeNull();
  });

  it('returns null for wrong type on a key', () => {
    expect(deserialize(JSON.stringify({ ...sample, cash: 'lots' }))).toBeNull();
  });

  it('returns null when prestigeShards is non-numeric', () => {
    expect(deserialize(JSON.stringify({ ...sample, prestigeShards: 'nope' }))).toBeNull();
  });

  it('returns null when prestigeShopLevels contains non-numeric value', () => {
    const bad = { ...sample, prestigeShopLevels: { 'mult.cash': 'hack' } };
    expect(deserialize(JSON.stringify(bad))).toBeNull();
  });

  it('returns null when instancesBoughtThisRun value is negative', () => {
    const bad = { ...sample, instancesBoughtThisRun: { saw: -1 } };
    expect(deserialize(JSON.stringify(bad))).toBeNull();
  });

  it('saves and loads via localStorage', () => {
    saveToLocalStorage(sample);
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();
    expect(loadFromLocalStorage()).toEqual(sample);
  });

  it('loadFromLocalStorage returns null when empty', () => {
    expect(loadFromLocalStorage()).toBeNull();
  });

  it('returns null when weaponInstances is missing', () => {
    const { weaponInstances: _w, ...rest } = sample;
    void _w;
    expect(deserialize(JSON.stringify(rest))).toBeNull();
  });

  it('returns null when a weaponInstance entry is malformed', () => {
    const bad = { ...sample, weaponInstances: [{ typeId: 'saw', x: 'nope', y: 0 }] };
    expect(deserialize(JSON.stringify(bad))).toBeNull();
  });

  it('returns null when a levels value is non-numeric', () => {
    const bad = { ...sample, levels: { sawDamage: 2, dropRate: 'hacked' } };
    expect(deserialize(JSON.stringify(bad))).toBeNull();
  });

  it('returns null when a levels value is NaN', () => {
    const bad = { ...sample, levels: { sawDamage: Number.NaN } };
    expect(deserialize(JSON.stringify(bad))).toBeNull();
  });

  it('returns null when a weaponCounts value is negative', () => {
    const bad = { ...sample, weaponCounts: { saw: -1 } };
    expect(deserialize(JSON.stringify(bad))).toBeNull();
  });

  it('returns null when a weaponCounts value is non-numeric', () => {
    const bad = { ...sample, weaponCounts: { saw: 'two' } };
    expect(deserialize(JSON.stringify(bad))).toBeNull();
  });

  it('round-trips multiple weapon instances', () => {
    const multi: SaveStateV2 = {
      ...sample,
      weaponInstances: [
        { typeId: 'saw', x: 400, y: 500, clockwise: true },
        { typeId: 'saw', x: 600, y: 500, clockwise: false },
        { typeId: 'laser', x: 700, y: 300 },
      ],
    };
    expect(deserialize(serialize(multi))).toEqual(multi);
  });

  it('accepts a saw instance without an explicit clockwise field', () => {
    const noDir: SaveStateV2 = {
      ...sample,
      weaponInstances: [{ typeId: 'saw', x: 400, y: 500 }],
    };
    expect(deserialize(serialize(noDir))).toEqual(noDir);
  });

  it('returns null when clockwise is non-boolean', () => {
    const bad = { ...sample, weaponInstances: [{ typeId: 'saw', x: 0, y: 0, clockwise: 'yes' }] };
    expect(deserialize(JSON.stringify(bad))).toBeNull();
  });
});

describe('saveState v1 migration', () => {
  beforeEach(() => localStorage.clear());

  const v1 = {
    v: 1 as const,
    cash: 50,
    levels: { 'saw.damage': 1 },
    weaponCounts: { grinder: 1, saw: 1 },
    weaponInstances: [] as Array<{ typeId: string; x: number; y: number; clockwise?: boolean }>,
    emaCashPerSec: 0,
    savedAt: 1_700_000_000_000,
  };

  it('migrates a v1 payload to v2 with default prestige fields', () => {
    const migrated = deserialize(JSON.stringify(v1));
    expect(migrated).not.toBeNull();
    expect(migrated!.v).toBe(2);
    expect(migrated!.cash).toBe(50);
    expect(migrated!.prestigeShards).toBe(0);
    expect(migrated!.prestigeCount).toBe(0);
    expect(migrated!.prestigeShopLevels).toEqual({});
    expect(migrated!.pendingShardsThisRun).toBe(0);
    expect(migrated!.instancesBoughtThisRun).toEqual({});
    expect(typeof migrated!.runSeed).toBe('string');
    expect(migrated!.runSeed.length).toBeGreaterThan(0);
  });

  it('loadFromLocalStorage migrates v1 key and rewrites as v2', () => {
    localStorage.setItem(STORAGE_KEY_V1, JSON.stringify(v1));
    const loaded = loadFromLocalStorage();
    expect(loaded).not.toBeNull();
    expect(loaded!.v).toBe(2);
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();
    expect(localStorage.getItem(STORAGE_KEY_V1)).toBeNull();
  });

  it('rejects v1 payload with invalid cash', () => {
    expect(deserialize(JSON.stringify({ ...v1, cash: 'bad' }))).toBeNull();
  });
});
