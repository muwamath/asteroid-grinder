export interface SavedWeaponInstallation {
  slotId: string;
  typeId: string;
  instanceId: string;
  clockwise?: boolean;
}

export interface SaveStateV3 {
  v: 3;
  cash: number;
  levels: Record<string, number>;
  weaponCounts: Record<string, number>;
  weaponInstallations: SavedWeaponInstallation[];
  emaCashPerSec: number;
  savedAt: number;
  runSeed: string;
  arenaSeed: number;
  arenaSlotsUnlocked: string[];
  arenaFreeUnlockUsed: boolean;
  pendingShardsThisRun: number;
  prestigeShards: number;
  prestigeCount: number;
  prestigeShopLevels: Record<string, number>;
  instancesBoughtThisRun: Record<string, number>;
}

export const SAVE_STATE_VERSION = 3;
export const STORAGE_KEY = 'asteroid-grinder:save:v3';
export const STORAGE_KEY_V1 = 'asteroid-grinder:save:v1';
export const STORAGE_KEY_V2 = 'asteroid-grinder:save:v2';
export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;
export const MIN_OFFLINE_MS = 60 * 1000;

export function serialize(state: SaveStateV3): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): SaveStateV3 | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Partial<SaveStateV3>;
  if (p.v !== 3) return null;
  if (!validateV3(p)) return null;
  return p as SaveStateV3;
}

function validateV3(p: Partial<SaveStateV3>): boolean {
  if (typeof p.cash !== 'number' || !Number.isFinite(p.cash)) return false;
  if (!p.levels || typeof p.levels !== 'object') return false;
  for (const v of Object.values(p.levels)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return false;
  }
  if (!p.weaponCounts || typeof p.weaponCounts !== 'object') return false;
  for (const v of Object.values(p.weaponCounts)) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return false;
  }
  if (!Array.isArray(p.weaponInstallations)) return false;
  for (const inst of p.weaponInstallations) {
    if (!inst || typeof inst !== 'object') return false;
    if (typeof inst.slotId !== 'string') return false;
    if (typeof inst.typeId !== 'string') return false;
    if (typeof inst.instanceId !== 'string') return false;
    if (inst.clockwise !== undefined && typeof inst.clockwise !== 'boolean') return false;
  }
  if (typeof p.emaCashPerSec !== 'number') return false;
  if (typeof p.savedAt !== 'number') return false;
  if (typeof p.runSeed !== 'string') return false;
  if (typeof p.arenaSeed !== 'number' || !Number.isFinite(p.arenaSeed)) return false;
  if (!Array.isArray(p.arenaSlotsUnlocked)) return false;
  for (const id of p.arenaSlotsUnlocked) {
    if (typeof id !== 'string') return false;
  }
  if (typeof p.arenaFreeUnlockUsed !== 'boolean') return false;
  if (typeof p.pendingShardsThisRun !== 'number') return false;
  if (typeof p.prestigeShards !== 'number') return false;
  if (typeof p.prestigeCount !== 'number') return false;
  if (!p.prestigeShopLevels || typeof p.prestigeShopLevels !== 'object') return false;
  for (const v of Object.values(p.prestigeShopLevels)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return false;
  }
  if (!p.instancesBoughtThisRun || typeof p.instancesBoughtThisRun !== 'object') return false;
  for (const v of Object.values(p.instancesBoughtThisRun)) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return false;
  }
  return true;
}

export function saveToLocalStorage(state: SaveStateV3): void {
  try {
    localStorage.setItem(STORAGE_KEY, serialize(state));
  } catch {
    // Quota exceeded, privacy mode, or SSR — silent.
  }
}

export function loadFromLocalStorage(): SaveStateV3 | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return deserialize(raw);
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY_V2);
    localStorage.removeItem(STORAGE_KEY_V1);
  } catch {
    // ignore
  }
}

// True if a save from a prior schema version exists. Bootstrap clears and
// toasts when this is true.
export function hasLegacySave(): boolean {
  try {
    return (
      localStorage.getItem(STORAGE_KEY_V2) != null ||
      localStorage.getItem(STORAGE_KEY_V1) != null
    );
  } catch {
    return false;
  }
}
