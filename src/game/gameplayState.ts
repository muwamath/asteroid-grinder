type Listener<A extends unknown[]> = (...args: A) => void;

interface Events {
  cashChanged: [cash: number, delta: number];
  upgradeLevelChanged: [id: string, level: number];
}

class GameplayState {
  private _cash = 0;
  private readonly _levels = new Map<string, number>();
  private readonly listeners: { [K in keyof Events]: Set<Listener<Events[K]>> } = {
    cashChanged: new Set(),
    upgradeLevelChanged: new Set(),
  };

  get cash(): number {
    return this._cash;
  }

  addCash(amount: number): void {
    if (amount === 0) return;
    this._cash += amount;
    this.emit('cashChanged', this._cash, amount);
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

  setLevel(id: string, level: number): void {
    this._levels.set(id, level);
    this.emit('upgradeLevelChanged', id, level);
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
  }

  // Full reset including listeners. Used by tests for isolation between cases.
  reset(): void {
    this.resetData();
    this.listeners.cashChanged.clear();
    this.listeners.upgradeLevelChanged.clear();
  }

  private emit<E extends keyof Events>(event: E, ...args: Events[E]): void {
    for (const cb of this.listeners[event]) {
      (cb as Listener<Events[E]>)(...args);
    }
  }
}

export const gameplayState = new GameplayState();
export type { GameplayState };
