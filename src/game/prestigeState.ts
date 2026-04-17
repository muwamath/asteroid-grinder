type Listener<A extends unknown[]> = (...args: A) => void;

interface Events {
  shardsChanged: [total: number, delta: number];
  shopLevelChanged: [id: string, level: number];
  prestigeRegistered: [count: number];
}

export interface PrestigeSnapshot {
  shards: number;
  prestigeCount: number;
  shopLevels: Record<string, number>;
}

class PrestigeState {
  private _shards = 0;
  private _prestigeCount = 0;
  private readonly _shopLevels = new Map<string, number>();
  private readonly listeners: { [K in keyof Events]: Set<Listener<Events[K]>> } = {
    shardsChanged: new Set(),
    shopLevelChanged: new Set(),
    prestigeRegistered: new Set(),
  };

  get shards(): number { return this._shards; }
  get prestigeCount(): number { return this._prestigeCount; }

  shopLevel(id: string): number {
    return this._shopLevels.get(id) ?? 0;
  }

  shopLevels(): Readonly<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const [k, v] of this._shopLevels) out[k] = v;
    return out;
  }

  addShards(amount: number): void {
    if (amount === 0) return;
    this._shards += amount;
    this.emit('shardsChanged', this._shards, amount);
  }

  trySpend(amount: number): boolean {
    if (this._shards < amount) return false;
    this._shards -= amount;
    this.emit('shardsChanged', this._shards, -amount);
    return true;
  }

  setShopLevel(id: string, level: number): void {
    this._shopLevels.set(id, level);
    this.emit('shopLevelChanged', id, level);
  }

  registerPrestige(): void {
    this._prestigeCount += 1;
    this.emit('prestigeRegistered', this._prestigeCount);
  }

  loadSnapshot(s: PrestigeSnapshot): void {
    this._shards = s.shards;
    this.emit('shardsChanged', this._shards, s.shards);
    this._prestigeCount = s.prestigeCount;
    this.emit('prestigeRegistered', this._prestigeCount);
    this._shopLevels.clear();
    for (const [k, v] of Object.entries(s.shopLevels)) {
      this._shopLevels.set(k, v);
      this.emit('shopLevelChanged', k, v);
    }
  }

  on<E extends keyof Events>(event: E, cb: Listener<Events[E]>): () => void {
    this.listeners[event].add(cb as Listener<Events[keyof Events]>);
    return () => {
      this.listeners[event].delete(cb as Listener<Events[keyof Events]>);
    };
  }

  resetData(): void {
    this._shards = 0;
    this._prestigeCount = 0;
    this._shopLevels.clear();
    this.emit('shardsChanged', 0, 0);
  }

  reset(): void {
    this.resetData();
    this.listeners.shardsChanged.clear();
    this.listeners.shopLevelChanged.clear();
    this.listeners.prestigeRegistered.clear();
  }

  private emit<E extends keyof Events>(event: E, ...args: Events[E]): void {
    for (const cb of this.listeners[event]) {
      (cb as Listener<Events[E]>)(...args);
    }
  }
}

export const prestigeState = new PrestigeState();
export type { PrestigeState };
