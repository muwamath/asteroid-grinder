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

// SlotMask class removed 2026-04-17 — the runtime tracks unlock/install
// state directly on gameplayState, so the class was an unused parallel
// implementation. Pure helper functions above are the production API.
