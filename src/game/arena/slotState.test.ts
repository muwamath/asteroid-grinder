import { describe, it, expect } from 'vitest';
import { unlockCost, startingUnlockedCount } from './slotState';
import { BASE_STARTING_SLOTS, UNLOCK_BASE, UNLOCK_GROWTH } from './arenaConstants';

describe('unlockCost', () => {
  it('first unlock is free', () => {
    expect(unlockCost(0)).toBe(0);
  });

  it('subsequent unlocks follow BASE * GROWTH^(k-1)', () => {
    expect(unlockCost(1)).toBe(UNLOCK_BASE);
    expect(unlockCost(2)).toBe(Math.floor(UNLOCK_BASE * UNLOCK_GROWTH));
    expect(unlockCost(3)).toBe(Math.floor(UNLOCK_BASE * UNLOCK_GROWTH * UNLOCK_GROWTH));
  });
});

describe('startingUnlockedCount', () => {
  it('returns base + prestige level, clamped to totalSlots', () => {
    expect(startingUnlockedCount({ preUnlockedLevel: 0, totalSlots: 10 })).toBe(BASE_STARTING_SLOTS);
    // BASE_STARTING_SLOTS is high enough that every slot starts unlocked —
    // always clamp to totalSlots.
    expect(startingUnlockedCount({ preUnlockedLevel: 5, totalSlots: 10 })).toBe(10);
    expect(startingUnlockedCount({ preUnlockedLevel: 20, totalSlots: 4 })).toBe(4);
    void BASE_STARTING_SLOTS;
  });
});

// SlotMask tests removed with the class itself — gameplayState's unlock
// mask is covered by gameplayState.test.ts.
