type Listener<A extends unknown[]> = (...args: A) => void;

interface Events {
  cashChanged: [cash: number, delta: number];
  cashEarned: [amount: number];
  upgradeLevelChanged: [id: string, level: number];
  weaponCountChanged: [id: string, count: number];
}

export interface GameplaySnapshot {
  cash: number;
  levels: Record<string, number>;
  weaponCounts: Record<string, number>;
}

class GameplayState {
  private _cash = 0;
  private readonly _levels = new Map<string, number>();
  private readonly _weaponCounts = new Map<string, number>();
  private readonly _instancesBoughtThisRun = new Map<string, number>();
  private readonly listeners: { [K in keyof Events]: Set<Listener<Events[K]>> } = {
    cashChanged: new Set(),
    cashEarned: new Set(),
    upgradeLevelChanged: new Set(),
    weaponCountChanged: new Set(),
  };

  get cash(): number {
    return this._cash;
  }

  addCash(amount: number, opts?: { silent?: boolean }): void {
    if (amount === 0) return;
    this._cash += amount;
    this.emit('cashChanged', this._cash, amount);
    if (amount > 0 && !opts?.silent) this.emit('cashEarned', amount);
  }

  trySpend(amount: number): boolean {
    if (this._cash < amount) return false;
    this._cash -= amount;
    this.emit('cashChanged', this._cash, -amount);
    return true;
  }

  levelOf(id: string): number {
    return this._levels.get(id) ?? 0;
  }

  levels(): Readonly<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const [k, v] of this._levels) out[k] = v;
    return out;
  }

  initWeaponCounts(counts: Record<string, number>): void {
    this._weaponCounts.clear();
    for (const [id, count] of Object.entries(counts)) {
      this._weaponCounts.set(id, count);
    }
  }

  weaponCount(id: string): number {
    return this._weaponCounts.get(id) ?? 0;
  }

  buyWeapon(id: string): void {
    const current = this.weaponCount(id);
    this._weaponCounts.set(id, current + 1);
    const bought = this._instancesBoughtThisRun.get(id) ?? 0;
    this._instancesBoughtThisRun.set(id, bought + 1);
    this.emit('weaponCountChanged', id, current + 1);
  }

  instancesBoughtThisRun(id: string): number {
    return this._instancesBoughtThisRun.get(id) ?? 0;
  }

  allInstancesBoughtThisRun(): Readonly<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const [k, v] of this._instancesBoughtThisRun) out[k] = v;
    return out;
  }

  setInstancesBoughtThisRun(m: Record<string, number>): void {
    this._instancesBoughtThisRun.clear();
    for (const [k, v] of Object.entries(m)) this._instancesBoughtThisRun.set(k, v);
  }

  sellWeapon(id: string): boolean {
    const current = this.weaponCount(id);
    if (current <= 1) return false;
    this._weaponCounts.set(id, current - 1);
    this.emit('weaponCountChanged', id, current - 1);
    return true;
  }

  setLevel(id: string, level: number): void {
    this._levels.set(id, level);
    this.emit('upgradeLevelChanged', id, level);
  }

  // Bulk-restore from a persisted snapshot. Emits events so subscribers
  // (UI scene, game scene) can reconcile. Caller is responsible for
  // resetData() first if a clean slate is required.
  loadSnapshot(s: GameplaySnapshot): void {
    this._cash = s.cash;
    this.emit('cashChanged', this._cash, s.cash);
    this._levels.clear();
    for (const [k, v] of Object.entries(s.levels)) {
      this._levels.set(k, v);
      this.emit('upgradeLevelChanged', k, v);
    }
    this._weaponCounts.clear();
    for (const [k, v] of Object.entries(s.weaponCounts)) {
      this._weaponCounts.set(k, v);
      this.emit('weaponCountChanged', k, v);
    }
  }

  on<E extends keyof Events>(event: E, cb: Listener<Events[E]>): () => void {
    this.listeners[event].add(cb as Listener<Events[keyof Events]>);
    return () => {
      this.listeners[event].delete(cb as Listener<Events[keyof Events]>);
    };
  }

  // Clears game data but leaves listeners intact. Use this when restarting
  // GameScene while UIScene (or any other long-lived listener) is still subscribed.
  resetData(): void {
    this._cash = 0;
    this._levels.clear();
    this._weaponCounts.clear();
    this._instancesBoughtThisRun.clear();
  }

  // Full reset including listeners. Used by tests for isolation between cases.
  reset(): void {
    this.resetData();
    this.listeners.cashChanged.clear();
    this.listeners.cashEarned.clear();
    this.listeners.upgradeLevelChanged.clear();
    this.listeners.weaponCountChanged.clear();
  }

  private emit<E extends keyof Events>(event: E, ...args: Events[E]): void {
    for (const cb of this.listeners[event]) {
      (cb as Listener<Events[E]>)(...args);
    }
  }
}

export const gameplayState = new GameplayState();
export type { GameplayState };
