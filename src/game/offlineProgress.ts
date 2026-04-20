export interface OfflineAwardInput {
  rate: number; // cash/sec
  elapsedMs: number;
  capMs: number;
  rateMultiplier?: number; // default 1 — scales input rate (from prestige `offline.rate`)
}

export function computeOfflineAward({ rate, elapsedMs, capMs, rateMultiplier = 1 }: OfflineAwardInput): number {
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  const effectiveRate = rate * Math.max(0, rateMultiplier);
  const clamped = Math.min(elapsedMs, capMs);
  return Math.floor(effectiveRate * (clamped / 1000));
}
