import { BASE_STARTING_SLOTS, UNLOCK_BASE, UNLOCK_GROWTH } from './arenaConstants';

export function unlockCost(alreadyUnlockedBeyondStart: number): number {
  if (alreadyUnlockedBeyondStart <= 0) return 0;
  return Math.floor(UNLOCK_BASE * Math.pow(UNLOCK_GROWTH, alreadyUnlockedBeyondStart - 1));
}

export function startingUnlockedCount(opts: {
  preUnlockedLevel: number;
  totalSlots: number;
}): number {
  return Math.min(BASE_STARTING_SLOTS + opts.preUnlockedLevel, opts.totalSlots);
}

export interface SlotMaskSnapshot {
  readonly unlocked: readonly string[];
  readonly freeUnlockUsed: boolean;
}

export class SlotMask {
  private readonly _unlocked = new Set<string>();
  private readonly _allIds: readonly string[];
  private _freeUnlockUsed = false;

  constructor(allSlotIds: readonly string[]) {
    this._allIds = allSlotIds;
  }

  get unlockedCount(): number {
    return this._unlocked.size;
  }

  get freeUnlockUsed(): boolean {
    return this._freeUnlockUsed;
  }

  get allIds(): readonly string[] {
    return this._allIds;
  }

  isUnlocked(id: string): boolean {
    return this._unlocked.has(id);
  }

  unlock(id: string): void {
    this._unlocked.add(id);
  }

  markFreeUnlockUsed(): void {
    this._freeUnlockUsed = true;
  }

  snapshot(): SlotMaskSnapshot {
    return { unlocked: [...this._unlocked], freeUnlockUsed: this._freeUnlockUsed };
  }

  static fromSnapshot(allSlotIds: readonly string[], snap: SlotMaskSnapshot): SlotMask {
    const m = new SlotMask(allSlotIds);
    for (const id of snap.unlocked) m._unlocked.add(id);
    m._freeUnlockUsed = snap.freeUnlockUsed;
    return m;
  }
}
