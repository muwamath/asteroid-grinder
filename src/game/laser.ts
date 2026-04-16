import Phaser from 'phaser';

const DEG_TO_RAD = Math.PI / 180;
const FIRE_CONE_RAD = 15 * DEG_TO_RAD;

export interface LaserParams {
  aimSpeed: number;     // degrees per second
  range: number;        // pixels
  damage: number;       // DPS
  cooldown: number;     // seconds
}

export class Laser {
  aimAngle = -Math.PI / 2; // barrel points up initially
  target: Phaser.Physics.Matter.Image | null = null;
  cooldownRemaining: number;
  firing = false;

  constructor(initialCooldown: number) {
    this.cooldownRemaining = Math.random() * initialCooldown;
  }

  /** Run once per frame. Returns damage to apply (0 if not firing). */
  update(
    deltaMs: number,
    originX: number,
    originY: number,
    chunks: Set<Phaser.Physics.Matter.Image>,
    params: LaserParams,
  ): number {
    const dt = deltaMs / 1000;

    // ── cooldown ──
    if (this.cooldownRemaining > 0) {
      this.cooldownRemaining -= dt;
      this.firing = false;
      return 0;
    }

    // ── validate current target ──
    if (this.target) {
      if (!this.target.active || this.target.getData('dead')) {
        this.loseTarget(params.cooldown);
        return 0;
      }
      const dist = Phaser.Math.Distance.Between(originX, originY, this.target.x, this.target.y);
      if (dist > params.range) {
        this.loseTarget(params.cooldown);
        return 0;
      }
    }

    // ── acquire target if needed ──
    if (!this.target) {
      this.target = this.findBestTarget(originX, originY, chunks, params.range);
      if (!this.target) {
        this.firing = false;
        return 0;
      }
    }

    // ── rotate toward target ──
    const targetAngle = Math.atan2(
      this.target.y - originY,
      this.target.x - originX,
    );
    const maxRot = params.aimSpeed * DEG_TO_RAD * dt;
    this.aimAngle = rotateToward(this.aimAngle, targetAngle, maxRot);

    // ── fire if within cone ──
    const angleDiff = Math.abs(angleDelta(this.aimAngle, targetAngle));
    if (angleDiff <= FIRE_CONE_RAD) {
      this.firing = true;
      return params.damage * dt;
    }

    this.firing = false;
    return 0;
  }

  /** Barrel tip position for beam origin. */
  emitPoint(originX: number, originY: number, radius: number): { x: number; y: number } {
    return {
      x: originX + Math.cos(this.aimAngle) * radius,
      y: originY + Math.sin(this.aimAngle) * radius,
    };
  }

  private loseTarget(cooldown: number): void {
    this.target = null;
    this.firing = false;
    this.cooldownRemaining = cooldown;
  }

  private findBestTarget(
    ox: number,
    oy: number,
    chunks: Set<Phaser.Physics.Matter.Image>,
    range: number,
  ): Phaser.Physics.Matter.Image | null {
    let best: Phaser.Physics.Matter.Image | null = null;
    let bestScore = Infinity;

    for (const chunk of chunks) {
      if (!chunk.active || chunk.getData('dead')) continue;
      const dist = Phaser.Math.Distance.Between(ox, oy, chunk.x, chunk.y);
      if (dist > range) continue;

      const angle = Math.atan2(chunk.y - oy, chunk.x - ox);
      const angDiff = Math.abs(angleDelta(this.aimAngle, angle));
      // Angular proximity weighted more heavily than distance.
      const score = angDiff + (dist / range) * 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = chunk;
      }
    }

    return best;
  }
}

/** Signed shortest angular difference, normalized to [-PI, PI]. */
function angleDelta(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Rotate `from` toward `to` by at most `maxStep` radians. */
function rotateToward(from: number, to: number, maxStep: number): number {
  const delta = angleDelta(from, to);
  if (Math.abs(delta) <= maxStep) return to;
  return from + Math.sign(delta) * maxStep;
}
