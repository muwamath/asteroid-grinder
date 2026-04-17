import { describe, it, expect } from 'vitest';
import { unlockCost, startingUnlockedCount, SlotMask } from './slotState';
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
    expect(startingUnlockedCount({ preUnlockedLevel: 5, totalSlots: 10 })).toBe(
      BASE_STARTING_SLOTS + 5,
    );
    expect(startingUnlockedCount({ preUnlockedLevel: 20, totalSlots: 4 })).toBe(4);
  });
});

describe('SlotMask', () => {
  it('tracks unlocked slots and reports counts', () => {
    const mask = new SlotMask(['a', 'b', 'c']);
    mask.unlock('a');
    expect(mask.isUnlocked('a')).toBe(true);
    expect(mask.isUnlocked('b')).toBe(false);
    expect(mask.unlockedCount).toBe(1);
  });

  it('tracks freeUnlockUsed once, then stays true', () => {
    const mask = new SlotMask(['a', 'b']);
    expect(mask.freeUnlockUsed).toBe(false);
    mask.markFreeUnlockUsed();
    expect(mask.freeUnlockUsed).toBe(true);
    mask.markFreeUnlockUsed();
    expect(mask.freeUnlockUsed).toBe(true);
  });

  it('serializes + restores', () => {
    const mask = new SlotMask(['a', 'b', 'c']);
    mask.unlock('a');
    mask.unlock('c');
    mask.markFreeUnlockUsed();
    const snap = mask.snapshot();
    const restored = SlotMask.fromSnapshot(['a', 'b', 'c'], snap);
    expect(restored.isUnlocked('a')).toBe(true);
    expect(restored.isUnlocked('b')).toBe(false);
    expect(restored.isUnlocked('c')).toBe(true);
    expect(restored.freeUnlockUsed).toBe(true);
  });
});
