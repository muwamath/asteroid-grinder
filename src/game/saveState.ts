export interface SavedWeaponInstance {
  typeId: string;
  x: number;
  y: number;
  clockwise?: boolean;
}

export interface SaveStateV1 {
  v: 1;
  cash: number;
  levels: Record<string, number>;
  weaponCounts: Record<string, number>;
  weaponInstances: SavedWeaponInstance[];
  emaCashPerSec: number;
  savedAt: number;
}

export interface SaveStateV2 {
  v: 2;
  cash: number;
  levels: Record<string, number>;
  weaponCounts: Record<string, number>;
  weaponInstances: SavedWeaponInstance[];
  emaCashPerSec: number;
  savedAt: number;
  runSeed: string;
  pendingShardsThisRun: number;
  prestigeShards: number;
  prestigeCount: number;
  prestigeShopLevels: Record<string, number>;
  instancesBoughtThisRun: Record<string, number>;
}

export const SAVE_STATE_VERSION = 2;
export const STORAGE_KEY = 'asteroid-grinder:save:v2';
export const STORAGE_KEY_V1 = 'asteroid-grinder:save:v1';
export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;
export const MIN_OFFLINE_MS = 60 * 1000;

export function serialize(state: SaveStateV2): string {
  return JSON.stringify(state);
}

function randomSeed(): string {
  return `cosmic-dust-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function validateBase(p: Partial<SaveStateV2>): boolean {
  if (typeof p.cash !== 'number') return false;
  if (!p.levels || typeof p.levels !== 'object') return false;
  for (const v of Object.values(p.levels)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return false;
  }
  if (!p.weaponCounts || typeof p.weaponCounts !== 'object') return false;
  for (const v of Object.values(p.weaponCounts)) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return false;
  }
  if (!Array.isArray(p.weaponInstances)) return false;
  for (const inst of p.weaponInstances) {
    if (!inst || typeof inst !== 'object') return false;
    if (typeof inst.typeId !== 'string') return false;
    if (typeof inst.x !== 'number' || typeof inst.y !== 'number') return false;
    if (inst.clockwise !== undefined && typeof inst.clockwise !== 'boolean') return false;
  }
  if (typeof p.emaCashPerSec !== 'number') return false;
  if (typeof p.savedAt !== 'number') return false;
  return true;
}

function migrateV1(p: SaveStateV1): SaveStateV2 {
  return {
    v: 2,
    cash: p.cash,
    levels: p.levels,
    weaponCounts: p.weaponCounts,
    weaponInstances: p.weaponInstances,
    emaCashPerSec: p.emaCashPerSec,
    savedAt: p.savedAt,
    runSeed: randomSeed(),
    pendingShardsThisRun: 0,
    prestigeShards: 0,
    prestigeCount: 0,
    prestigeShopLevels: {},
    instancesBoughtThisRun: {},
  };
}

export function deserialize(json: string): SaveStateV2 | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const raw = parsed as Record<string, unknown>;
  const version = raw.v;
  if (version === 1) {
    if (!validateBase(raw as Partial<SaveStateV2>)) return null;
    return migrateV1(raw as unknown as SaveStateV1);
  }
  if (version !== 2) return null;
  const p = raw as Partial<SaveStateV2>;
  if (!validateBase(p)) return null;
  if (typeof p.runSeed !== 'string') return null;
  if (typeof p.pendingShardsThisRun !== 'number') return null;
  if (typeof p.prestigeShards !== 'number') return null;
  if (typeof p.prestigeCount !== 'number') return null;
  if (!p.prestigeShopLevels || typeof p.prestigeShopLevels !== 'object') return null;
  for (const v of Object.values(p.prestigeShopLevels)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  }
  if (!p.instancesBoughtThisRun || typeof p.instancesBoughtThisRun !== 'object') return null;
  for (const v of Object.values(p.instancesBoughtThisRun)) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
  }
  return p as SaveStateV2;
}

export function saveToLocalStorage(state: SaveStateV2): void {
  try {
    localStorage.setItem(STORAGE_KEY, serialize(state));
  } catch {
    // Quota exceeded, privacy mode, or SSR — silent.
  }
}

export function loadFromLocalStorage(): SaveStateV2 | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return deserialize(raw);
    const rawV1 = localStorage.getItem(STORAGE_KEY_V1);
    if (!rawV1) return null;
    const migrated = deserialize(rawV1);
    if (migrated) {
      saveToLocalStorage(migrated);
      localStorage.removeItem(STORAGE_KEY_V1);
    }
    return migrated;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY_V1);
  } catch {
    // ignore
  }
}
