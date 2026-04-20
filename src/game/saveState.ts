export interface SavedWeaponInstallation {
  slotId: string;
  typeId: string;
  instanceId: string;
  clockwise?: boolean;
}

/**
 * Current schema (v4). Added 2026-04-19 as part of the upgrade audit:
 *  - `asteroids.dropRate` upgrade renamed to `spawn.rate` (new `spawn` category)
 *  - `arena.preUnlockedSlots` prestige entry removed (dead since slot-lock removal)
 */
export interface SaveStateV4 {
  v: 4;
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

/** Legacy v3 shape — retained for migration only. */
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

export const SAVE_STATE_VERSION = 4;
export const STORAGE_KEY = 'asteroid-grinder:save:v4';
export const STORAGE_KEY_V3 = 'asteroid-grinder:save:v3';
export const STORAGE_KEY_V2 = 'asteroid-grinder:save:v2';
export const STORAGE_KEY_V1 = 'asteroid-grinder:save:v1';
export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;
export const MIN_OFFLINE_MS = 60 * 1000;

export function serialize(state: SaveStateV4): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): SaveStateV4 | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Partial<SaveStateV4>;
  if (p.v !== 4) return null;
  if (!validateShape(p)) return null;
  return p as SaveStateV4;
}

/**
 * Schema-shape validation shared between v3 and v4 (they're structurally
 * identical — v4 only changes the `v` field and the *meaning* of certain
 * level keys, which migration handles).
 */
function validateShape(p: Partial<SaveStateV4 | SaveStateV3>): boolean {
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

/**
 * Migrate a v3 snapshot into v4:
 *  - Rename `asteroids.dropRate` level → `spawn.rate`
 *  - Drop `arena.preUnlockedSlots` from prestigeShopLevels (dead upgrade)
 */
export function migrateV3ToV4(s: SaveStateV3): SaveStateV4 {
  const levels = { ...s.levels };
  if ('asteroids.dropRate' in levels) {
    levels['spawn.rate'] = levels['asteroids.dropRate'];
    delete levels['asteroids.dropRate'];
  }
  const prestigeShopLevels = { ...s.prestigeShopLevels };
  delete prestigeShopLevels['arena.preUnlockedSlots'];
  return { ...s, v: 4, levels, prestigeShopLevels };
}

function tryParseV3(json: string): SaveStateV3 | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Partial<SaveStateV3>;
  if (p.v !== 3) return null;
  if (!validateShape(p)) return null;
  return p as SaveStateV3;
}

export function saveToLocalStorage(state: SaveStateV4): void {
  try {
    localStorage.setItem(STORAGE_KEY, serialize(state));
  } catch {
    // Quota exceeded, privacy mode, or SSR — silent.
  }
}

export function loadFromLocalStorage(): SaveStateV4 | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return deserialize(raw);
    // v3 → v4 migration path
    const rawV3 = localStorage.getItem(STORAGE_KEY_V3);
    if (rawV3) {
      const parsedV3 = tryParseV3(rawV3);
      if (parsedV3) {
        const migrated = migrateV3ToV4(parsedV3);
        saveToLocalStorage(migrated);
        localStorage.removeItem(STORAGE_KEY_V3);
        return migrated;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY_V3);
    localStorage.removeItem(STORAGE_KEY_V2);
    localStorage.removeItem(STORAGE_KEY_V1);
  } catch {
    // ignore
  }
}

/**
 * True if a save from v1 or v2 exists (not automigratable). Bootstrap clears
 * and toasts when this is true. v3 is handled transparently by
 * `loadFromLocalStorage` and does NOT count as legacy.
 */
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
