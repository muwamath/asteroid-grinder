import { describe, expect, it } from 'vitest';
import { clampWeaponToChute } from './weaponPlacement';

const BOUNDS = {
  sceneWidth: 2560,
  channelHalfWidth: 44,      // L0 base
  channelTopY: 160,
  deathLineY: 1304,
};

describe('clampWeaponToChute', () => {
  it('returns input unchanged when already inside the chute', () => {
    const r = 12;
    const out = clampWeaponToChute(r, 1280, 700, BOUNDS);
    expect(out).toEqual({ x: 1280, y: 700 });
  });

  it('clamps far-left x to the chute inner-left edge', () => {
    const r = 12;
    const out = clampWeaponToChute(r, 50, 700, BOUNDS);
    // halfW 1280, halfChannel 44 → minX = 1280 - 44 + 12 + 8 = 1256
    expect(out).toEqual({ x: 1256, y: 700 });
  });

  it('clamps far-right x to the chute inner-right edge', () => {
    const r = 12;
    const out = clampWeaponToChute(r, 9000, 9000, BOUNDS);
    // maxX = 1280 + 44 - 12 - 8 = 1304; maxY = 1304 - 12 - 8 = 1284
    expect(out).toEqual({ x: 1304, y: 1284 });
  });

  it('clamps y above the channel top to the top edge', () => {
    const r = 12;
    const out = clampWeaponToChute(r, 1280, 0, BOUNDS);
    expect(out!.y).toBe(160 + 12 + 8);
  });

  it('returns null when chute is too narrow for the weapon radius', () => {
    const tightBounds = { ...BOUNDS, channelHalfWidth: 5 };
    const r = 12;
    expect(clampWeaponToChute(r, 1280, 700, tightBounds)).toBeNull();
  });

  it('returns null when chute is too short for the weapon radius', () => {
    const squishedBounds = { ...BOUNDS, channelTopY: 1200, deathLineY: 1220 };
    const r = 12;
    expect(clampWeaponToChute(r, 1280, 700, squishedBounds)).toBeNull();
  });
});
