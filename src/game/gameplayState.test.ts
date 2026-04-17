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
    it('restores cash, levels, weapon counts and emits events', () => {
      const cashSpy = vi.fn();
      const lvlSpy = vi.fn();
      const cntSpy = vi.fn();
      gameplayState.on('cashChanged', cashSpy);
      gameplayState.on('upgradeLevelChanged', lvlSpy);
      gameplayState.on('weaponCountChanged', cntSpy);

      gameplayState.loadSnapshot({
        cash: 500,
        levels: { sawDamage: 3 },
        weaponCounts: { saw: 2 },
      });

      expect(gameplayState.cash).toBe(500);
      expect(gameplayState.levelOf('sawDamage')).toBe(3);
      expect(gameplayState.weaponCount('saw')).toBe(2);
      expect(cashSpy).toHaveBeenCalled();
      expect(lvlSpy).toHaveBeenCalledWith('sawDamage', 3);
      expect(cntSpy).toHaveBeenCalledWith('saw', 2);
    });

    it('replaces prior levels/weapons rather than merging', () => {
      gameplayState.setLevel('oldUpgrade', 5);
      gameplayState.initWeaponCounts({ laser: 1, saw: 1 });
      gameplayState.loadSnapshot({
        cash: 0,
        levels: { dropRate: 2 },
        weaponCounts: { saw: 1 },
      });
      expect(gameplayState.levelOf('oldUpgrade')).toBe(0);
      expect(gameplayState.weaponCount('laser')).toBe(0);
      expect(gameplayState.levelOf('dropRate')).toBe(2);
    });
  });

  describe('arena slot tracking', () => {
    it('initArenaSlots clears installation map and unlock state', () => {
      gameplayState.initArenaSlots(['a', 'b']);
      gameplayState.installWeapon('a', 'saw', 'inst-1');
      gameplayState.tryUnlockSlot('a', 0);
      gameplayState.markFreeUnlockUsed();
      gameplayState.initArenaSlots(['x', 'y']);
      expect(gameplayState.installedAt('x')).toBeUndefined();
      expect(gameplayState.isSlotUnlocked('a')).toBe(false);
      expect(gameplayState.freeUnlockUsed).toBe(false);
    });

    it('tryUnlockSlot debits cash, emits slotUnlocked, updates mask', () => {
      gameplayState.addCash(1000);
      gameplayState.initArenaSlots(['a', 'b']);
      const events: string[] = [];
      gameplayState.on('slotUnlocked', (id) => events.push(id));
      expect(gameplayState.tryUnlockSlot('a', 100)).toBe(true);
      expect(gameplayState.cash).toBe(900);
      expect(gameplayState.isSlotUnlocked('a')).toBe(true);
      expect(events).toEqual(['a']);
    });

    it('tryUnlockSlot with cost 0 succeeds even at $0 cash', () => {
      gameplayState.initArenaSlots(['a']);
      expect(gameplayState.tryUnlockSlot('a', 0)).toBe(true);
      expect(gameplayState.cash).toBe(0);
    });

    it('tryUnlockSlot with insufficient cash fails and does not mutate', () => {
      gameplayState.addCash(50);
      gameplayState.initArenaSlots(['a']);
      expect(gameplayState.tryUnlockSlot('a', 100)).toBe(false);
      expect(gameplayState.cash).toBe(50);
      expect(gameplayState.isSlotUnlocked('a')).toBe(false);
    });

    it('installWeapon + uninstallWeapon maintain install map and emit events', () => {
      gameplayState.initArenaSlots(['a']);
      const installs: string[] = [];
      const uninstalls: string[] = [];
      gameplayState.on('weaponInstalled', (slotId) => installs.push(slotId));
      gameplayState.on('weaponUninstalled', (slotId) => uninstalls.push(slotId));
      gameplayState.installWeapon('a', 'saw', 'inst-1');
      expect(gameplayState.installedAt('a')).toEqual({ typeId: 'saw', instanceId: 'inst-1' });
      gameplayState.uninstallWeapon('a');
      expect(gameplayState.installedAt('a')).toBeUndefined();
      expect(installs).toEqual(['a']);
      expect(uninstalls).toEqual(['a']);
    });
  });
});
