// Pure math for validating + clamping a saved weapon position to the
// current chute bounds. Extracted so it can be unit-tested without Phaser.

export interface ChuteBounds {
  readonly sceneWidth: number;
  readonly channelHalfWidth: number;
  readonly channelTopY: number;
  readonly deathLineY: number;
}

export function clampWeaponToChute(
  bodyRadius: number,
  x: number,
  y: number,
  bounds: ChuteBounds,
): { x: number; y: number } | null {
  const halfW = bounds.sceneWidth / 2;
  const minX = halfW - bounds.channelHalfWidth + bodyRadius + 8;
  const maxX = halfW + bounds.channelHalfWidth - bodyRadius - 8;
  const minY = bounds.channelTopY + bodyRadius + 8;
  const maxY = bounds.deathLineY - bodyRadius - 8;
  if (minX > maxX || minY > maxY) return null;
  return {
    x: Math.min(Math.max(x, minX), maxX),
    y: Math.min(Math.max(y, minY), maxY),
  };
}
