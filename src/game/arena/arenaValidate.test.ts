import { describe, it, expect } from 'vitest';
import { isPlayable, minWallSlantDeg } from './arenaValidate';
import type { ArenaLayout } from './arenaTypes';

const PLAYFIELD = { width: 1200, height: 1440 };

function layout(walls: ArenaLayout['walls'], slots: ArenaLayout['slots'] = []): ArenaLayout {
  return { seed: 1, walls, slots, floorY: 1380, playfield: PLAYFIELD };
}

describe('isPlayable', () => {
  it('accepts an empty arena (no interior walls)', () => {
    expect(isPlayable(layout([]))).toBe(true);
  });

  it('rejects an arena where a horizontal wall spans the whole width with no gap', () => {
    const walls = [{ x1: 0, y1: 700, x2: 1200, y2: 700 }];
    expect(isPlayable(layout(walls))).toBe(false);
  });

  it('accepts an arena where a horizontal wall leaves a wide enough gap', () => {
    const walls = [{ x1: 0, y1: 700, x2: 500, y2: 700 }];
    expect(isPlayable(layout(walls))).toBe(true);
  });
});

describe('minWallSlantDeg', () => {
  it('returns Infinity for an empty wall list', () => {
    expect(minWallSlantDeg([])).toBe(Infinity);
  });

  it('returns 0 for a perfectly horizontal wall', () => {
    expect(minWallSlantDeg([{ x1: 0, y1: 100, x2: 400, y2: 100 }])).toBe(0);
  });

  it('returns a positive angle for a slanted wall', () => {
    const deg = minWallSlantDeg([{ x1: 0, y1: 100, x2: 400, y2: 140 }]);
    expect(deg).toBeGreaterThan(0);
    expect(deg).toBeLessThan(90);
  });
});
