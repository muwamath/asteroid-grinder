export const PARTY_PALETTE: readonly number[] = [
  0xff4d6d,
  0xffd166,
  0x06d6a0,
  0x118ab2,
  0xef476f,
  0xc77dff,
  0x7bdff2,
  0xf6bd60,
] as const;

export function randomPaletteColor(rand: () => number): number {
  const i = Math.floor(rand() * PARTY_PALETTE.length);
  return PARTY_PALETTE[i];
}
