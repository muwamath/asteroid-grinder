export interface SavedWeaponInstance {
  typeId: string;
  x: number;
  y: number;
}

export interface SaveStateV1 {
  v: 1;
  cash: number;
  levels: Record<string, number>;
  weaponCounts: Record<string, number>;
  weaponInstances: SavedWeaponInstance[];
  sawClockwise: boolean;
  emaCashPerSec: number;
  savedAt: number;
}

export const STORAGE_KEY = 'asteroid-grinder:save:v1';
export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;
export const MIN_OFFLINE_MS = 60 * 1000;

export function serialize(state: SaveStateV1): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): SaveStateV1 | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Partial<SaveStateV1>;
  if (p.v !== 1) return null;
  if (typeof p.cash !== 'number') return null;
  if (!p.levels || typeof p.levels !== 'object') return null;
  for (const v of Object.values(p.levels)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  }
  if (!p.weaponCounts || typeof p.weaponCounts !== 'object') return null;
  for (const v of Object.values(p.weaponCounts)) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
  }
  if (!Array.isArray(p.weaponInstances)) return null;
  for (const inst of p.weaponInstances) {
    if (!inst || typeof inst !== 'object') return null;
    if (typeof inst.typeId !== 'string') return null;
    if (typeof inst.x !== 'number' || typeof inst.y !== 'number') return null;
  }
  if (typeof p.sawClockwise !== 'boolean') return null;
  if (typeof p.emaCashPerSec !== 'number') return null;
  if (typeof p.savedAt !== 'number') return null;
  return p as SaveStateV1;
}

export function saveToLocalStorage(state: SaveStateV1): void {
  try {
    localStorage.setItem(STORAGE_KEY, serialize(state));
  } catch {
    // Quota exceeded, privacy mode, or SSR — silent.
  }
}

export function loadFromLocalStorage(): SaveStateV1 | null {
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
  } catch {
    // ignore
  }
}
