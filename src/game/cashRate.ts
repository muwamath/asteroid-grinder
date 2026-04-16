// EMA of cash earned per second. τ controls smoothing — at τ = 60s, one
// minute of steady earnings gets the rate to ~63% of true, and transient
// spikes decay with that same timescale.
export class CashRateTracker {
  private _rate: number;
  constructor(
    private tauMs = 60_000,
    initial = 0,
  ) {
    this._rate = initial;
  }
  observe(cashEarned: number, deltaMs: number): void {
    if (deltaMs <= 0) return;
    const instantaneous = (cashEarned / deltaMs) * 1000;
    const alpha = deltaMs / (this.tauMs + deltaMs);
    this._rate = this._rate + alpha * (instantaneous - this._rate);
  }
  rate(): number {
    return this._rate;
  }
}
