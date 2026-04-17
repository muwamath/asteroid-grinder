import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import {
  serialize,
  deserialize,
  saveToLocalStorage,
  loadFromLocalStorage,
  clearSave,
  hasLegacySave,
  STORAGE_KEY,
  STORAGE_KEY_V1,
  STORAGE_KEY_V2,
  SAVE_STATE_VERSION,
  type SaveStateV3,
} from './saveState';

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

const sample: SaveStateV3 = {
  v: 3,
  cash: 123,
  levels: { sawDamage: 2, dropRate: 1 },
  weaponCounts: { saw: 1 },
  weaponInstallations: [{ slotId: 's1', typeId: 'saw', instanceId: 'inst-1', clockwise: true }],
  emaCashPerSec: 4.5,
  savedAt: 1_700_000_000_000,
  runSeed: 'cosmic-dust-abc',
  arenaSeed: 12345,
  arenaSlotsUnlocked: ['s1', 's2'],
  arenaFreeUnlockUsed: true,
  pendingShardsThisRun: 0,
  prestigeShards: 0,
  prestigeCount: 0,
  prestigeShopLevels: {},
  instancesBoughtThisRun: {},
};

describe('saveState v3', () => {
  beforeEach(() => localStorage.clear());

  it('SAVE_STATE_VERSION is 3', () => {
    expect(SAVE_STATE_VERSION).toBe(3);
  });

  it('round-trips via serialize/deserialize', () => {
    expect(deserialize(serialize(sample))).toEqual(sample);
  });

  it('returns null for malformed JSON', () => {
    expect(deserialize('not json')).toBeNull();
  });

  it('returns null for wrong version (v < 3)', () => {
    expect(deserialize(JSON.stringify({ ...sample, v: 2 }))).toBeNull();
    expect(deserialize(JSON.stringify({ ...sample, v: 1 }))).toBeNull();
  });

  it('returns null for missing required key', () => {
    const { cash: _cash, ...rest } = sample;
    void _cash;
    expect(deserialize(JSON.stringify(rest))).toBeNull();
  });

  it('returns null when arenaSeed is non-numeric', () => {
    expect(deserialize(JSON.stringify({ ...sample, arenaSeed: 'abc' }))).toBeNull();
  });

  it('returns null when arenaSlotsUnlocked is not an array', () => {
    expect(deserialize(JSON.stringify({ ...sample, arenaSlotsUnlocked: 'not-an-array' }))).toBeNull();
  });

  it('returns null when arenaFreeUnlockUsed is non-boolean', () => {
    expect(deserialize(JSON.stringify({ ...sample, arenaFreeUnlockUsed: 'yes' }))).toBeNull();
  });

  it('returns null when a weaponInstallation entry is malformed', () => {
    const bad = {
      ...sample,
      weaponInstallations: [{ slotId: 's1', typeId: 'saw' /* missing instanceId */ }],
    };
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

  it('round-trips multiple installations', () => {
    const multi: SaveStateV3 = {
      ...sample,
      weaponInstallations: [
        { slotId: 's1', typeId: 'saw', instanceId: 'inst-1', clockwise: true },
        { slotId: 's2', typeId: 'saw', instanceId: 'inst-2', clockwise: false },
        { slotId: 's3', typeId: 'laser', instanceId: 'inst-3' },
      ],
    };
    expect(deserialize(serialize(multi))).toEqual(multi);
  });
});

describe('saveState legacy wipe', () => {
  beforeEach(() => localStorage.clear());

  it('loadFromLocalStorage ignores v1/v2 keys entirely — returns null', () => {
    localStorage.setItem(
      STORAGE_KEY_V1,
      JSON.stringify({ v: 1, cash: 1, levels: {}, weaponCounts: {}, weaponInstances: [], emaCashPerSec: 0, savedAt: 0 }),
    );
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify({ v: 2 }));
    expect(loadFromLocalStorage()).toBeNull();
  });

  it('hasLegacySave returns true when v1 or v2 keys exist', () => {
    expect(hasLegacySave()).toBe(false);
    localStorage.setItem(STORAGE_KEY_V2, 'x');
    expect(hasLegacySave()).toBe(true);
    localStorage.clear();
    localStorage.setItem(STORAGE_KEY_V1, 'x');
    expect(hasLegacySave()).toBe(true);
  });

  it('clearSave wipes every known key', () => {
    localStorage.setItem(STORAGE_KEY_V1, 'x');
    localStorage.setItem(STORAGE_KEY_V2, 'x');
    localStorage.setItem(STORAGE_KEY, 'x');
    clearSave();
    expect(localStorage.getItem(STORAGE_KEY_V1)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY_V2)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
