import { describe, it, expect } from 'vitest';
import { generateArena } from './arenaGenerator';
import { isPlayable, minWallSlantDeg } from './arenaValidate';
import { MIN_SLOTS, MAX_SLOTS, MIN_WALL_SLANT_DEG, SLOT_SPACING } from './arenaConstants';

const PARAMS = { width: 2560, height: 1440, minSlots: MIN_SLOTS, maxSlots: MAX_SLOTS };

describe('generateArena', () => {
  it('is deterministic given the same seed', () => {
    const a = generateArena(12345, PARAMS);
    const b = generateArena(12345, PARAMS);
    expect(a).toEqual(b);
  });

  it('produces different layouts for different seeds', () => {
    const a = generateArena(1, PARAMS);
    const b = generateArena(2, PARAMS);
    expect(a).not.toEqual(b);
  });

  it('always produces slot count within [MIN_SLOTS, MAX_SLOTS]', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const layout = generateArena(seed, PARAMS);
      expect(layout.slots.length).toBeGreaterThanOrEqual(MIN_SLOTS);
      expect(layout.slots.length).toBeLessThanOrEqual(MAX_SLOTS);
    }
  });

  it('horizontal walls carry the minimum slant', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { walls } = generateArena(seed, PARAMS);
      const slant = minWallSlantDeg(walls);
      expect(slant === Infinity || slant >= MIN_WALL_SLANT_DEG - 0.01).toBe(true);
    }
  });

  it('generated layouts pass isPlayable', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const layout = generateArena(seed, PARAMS);
      expect(isPlayable(layout)).toBe(true);
    }
  });

  it('slots respect minimum spacing', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { slots } = generateArena(seed, PARAMS);
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          const dx = slots[i].x - slots[j].x;
          const dy = slots[i].y - slots[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          expect(d).toBeGreaterThanOrEqual(SLOT_SPACING * 0.6 - 1);
        }
      }
    }
  });

  it('slot IDs are unique within a layout', () => {
    const { slots } = generateArena(42, PARAMS);
    const ids = new Set(slots.map((s) => s.id));
    expect(ids.size).toBe(slots.length);
  });

  it('never returns a layout with slots.length < minSlots', () => {
    // Even under stressful minSlots requirements, the outer retry + fallback
    // must ensure we always clear the floor. This guards the silent-failure
    // path where placeSlots' top-up loop exhausts its safety cap.
    const tightParams = { ...PARAMS, minSlots: 8, maxSlots: 10 };
    for (let seed = 1; seed <= 100; seed++) {
      const layout = generateArena(seed, tightParams);
      expect(layout.slots.length).toBeGreaterThanOrEqual(tightParams.minSlots);
    }
  });
});
