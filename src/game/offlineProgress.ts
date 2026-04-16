export interface OfflineAwardInput {
  rate: number; // cash/sec
  elapsedMs: number;
  capMs: number;
}

export function computeOfflineAward({ rate, elapsedMs, capMs }: OfflineAwardInput): number {
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  const clamped = Math.min(elapsedMs, capMs);
  return Math.floor(rate * (clamped / 1000));
}
