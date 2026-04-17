import { describe, it, expect, beforeEach } from 'vitest';
import { prestigeState } from './prestigeState';

beforeEach(() => {
  prestigeState.reset();
});

describe('prestigeState', () => {
  it('starts at zero shards, zero prestiges, empty shop', () => {
    expect(prestigeState.shards).toBe(0);
    expect(prestigeState.prestigeCount).toBe(0);
    expect(prestigeState.shopLevel('mult.cash')).toBe(0);
  });

  it('addShards increments and emits shardsChanged', () => {
    const seen: number[] = [];
    prestigeState.on('shardsChanged', (_total, delta) => seen.push(delta));
    prestigeState.addShards(5);
    prestigeState.addShards(3);
    expect(prestigeState.shards).toBe(8);
    expect(seen).toEqual([5, 3]);
  });

  it('trySpend deducts when affordable, rejects otherwise', () => {
    prestigeState.addShards(10);
    expect(prestigeState.trySpend(4)).toBe(true);
    expect(prestigeState.shards).toBe(6);
    expect(prestigeState.trySpend(99)).toBe(false);
    expect(prestigeState.shards).toBe(6);
  });

  it('setShopLevel emits shopLevelChanged', () => {
    const seen: Array<[string, number]> = [];
    prestigeState.on('shopLevelChanged', (id, lv) => seen.push([id, lv]));
    prestigeState.setShopLevel('mult.cash', 3);
    expect(prestigeState.shopLevel('mult.cash')).toBe(3);
    expect(seen).toEqual([['mult.cash', 3]]);
  });

  it('registerPrestige increments count', () => {
    prestigeState.registerPrestige();
    prestigeState.registerPrestige();
    expect(prestigeState.prestigeCount).toBe(2);
  });

  it('loadSnapshot replaces state and emits events', () => {
    prestigeState.loadSnapshot({
      shards: 12,
      prestigeCount: 4,
      shopLevels: { 'mult.cash': 2, 'free.saw': 1 },
    });
    expect(prestigeState.shards).toBe(12);
    expect(prestigeState.prestigeCount).toBe(4);
    expect(prestigeState.shopLevel('mult.cash')).toBe(2);
    expect(prestigeState.shopLevel('free.saw')).toBe(1);
  });

  it('resetData wipes to zero without touching listeners', () => {
    const seen: number[] = [];
    prestigeState.on('shardsChanged', (total) => seen.push(total));
    prestigeState.addShards(5);
    prestigeState.resetData();
    expect(prestigeState.shards).toBe(0);
    prestigeState.addShards(2);
    expect(seen).toEqual([5, 0, 2]);
  });
});
