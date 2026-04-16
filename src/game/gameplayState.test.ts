import { describe, it, expect, beforeEach, vi } from 'vitest';
import { gameplayState } from './gameplayState';

describe('gameplayState', () => {
  beforeEach(() => gameplayState.reset());

  describe('cashEarned event', () => {
    it('fires only on positive deltas', () => {
      const earned = vi.fn();
      gameplayState.on('cashEarned', earned);
      gameplayState.addCash(10);
      gameplayState.addCash(-5);
      gameplayState.addCash(0);
      expect(earned).toHaveBeenCalledTimes(1);
      expect(earned).toHaveBeenCalledWith(10);
    });

    it('does not fire on trySpend', () => {
      gameplayState.addCash(100);
      const earned = vi.fn();
      gameplayState.on('cashEarned', earned);
      gameplayState.trySpend(30);
      expect(earned).not.toHaveBeenCalled();
    });

    it('suppresses cashEarned when silent flag is set', () => {
      const earned = vi.fn();
      const changed = vi.fn();
      gameplayState.on('cashEarned', earned);
      gameplayState.on('cashChanged', changed);
      gameplayState.addCash(500, { silent: true });
      expect(earned).not.toHaveBeenCalled();
      expect(changed).toHaveBeenCalled();
      expect(gameplayState.cash).toBe(500);
    });
  });

  describe('loadSnapshot', () => {
    it('restores cash, levels, weapon counts, saw dir and emits events', () => {
      const cashSpy = vi.fn();
      const lvlSpy = vi.fn();
      const cntSpy = vi.fn();
      const dirSpy = vi.fn();
      gameplayState.on('cashChanged', cashSpy);
      gameplayState.on('upgradeLevelChanged', lvlSpy);
      gameplayState.on('weaponCountChanged', cntSpy);
      gameplayState.on('sawDirectionChanged', dirSpy);

      gameplayState.loadSnapshot({
        cash: 500,
        levels: { sawDamage: 3 },
        weaponCounts: { saw: 2 },
        sawClockwise: false,
      });

      expect(gameplayState.cash).toBe(500);
      expect(gameplayState.levelOf('sawDamage')).toBe(3);
      expect(gameplayState.weaponCount('saw')).toBe(2);
      expect(gameplayState.sawClockwise).toBe(false);
      expect(cashSpy).toHaveBeenCalled();
      expect(lvlSpy).toHaveBeenCalledWith('sawDamage', 3);
      expect(cntSpy).toHaveBeenCalledWith('saw', 2);
      expect(dirSpy).toHaveBeenCalledWith(false);
    });

    it('replaces prior levels/weapons rather than merging', () => {
      gameplayState.setLevel('oldUpgrade', 5);
      gameplayState.initWeaponCounts({ laser: 1, saw: 1 });
      gameplayState.loadSnapshot({
        cash: 0,
        levels: { dropRate: 2 },
        weaponCounts: { saw: 1 },
        sawClockwise: true,
      });
      expect(gameplayState.levelOf('oldUpgrade')).toBe(0);
      expect(gameplayState.weaponCount('laser')).toBe(0);
      expect(gameplayState.levelOf('dropRate')).toBe(2);
    });
  });
});
