import Phaser from 'phaser';
import type { ChunkTarget } from './chunkTarget';

const DEG_TO_RAD = Math.PI / 180;
const FIRE_CONE_RAD = 15 * DEG_TO_RAD;

export interface LaserParams {
  aimSpeed: number;
  range: number;
  damage: number;
  cooldown: number;
}

export class Laser {
  aimAngle = -Math.PI / 2;
  targetId: string | null = null;
  targetX = 0;
  targetY = 0;
  cooldownRemaining: number;
  firing = false;

  constructor(initialCooldown: number) {
    this.cooldownRemaining = Math.random() * initialCooldown;
  }

  /** Run once per frame. Returns a target to damage (or null if not firing). */
  update(
    deltaMs: number,
    originX: number,
    originY: number,
    chunks: readonly ChunkTarget[],
    params: LaserParams,
  ): { damagePerTick: number; target: ChunkTarget } | null {
    const dt = deltaMs / 1000;

    if (this.cooldownRemaining > 0) {
      this.cooldownRemaining -= dt;
      this.firing = false;
      return null;
    }

    let target: ChunkTarget | null = null;
    if (this.targetId) {
      target = chunks.find((c) => c.id === this.targetId && !c.dead) ?? null;
      if (target) {
        const dist = Phaser.Math.Distance.Between(originX, originY, target.x, target.y);
        if (dist > params.range) target = null;
      }
      if (!target) this.loseTarget(params.cooldown);
    }

    if (!target) {
      target = this.findBestTarget(originX, originY, chunks, params.range);
      if (!target) {
        this.firing = false;
        return null;
      }
      this.targetId = target.id;
    }

    this.targetX = target.x;
    this.targetY = target.y;

    const targetAngle = Math.atan2(target.y - originY, target.x - originX);
    const maxRot = params.aimSpeed * DEG_TO_RAD * dt;
    this.aimAngle = rotateToward(this.aimAngle, targetAngle, maxRot);

    const angleDiff = Math.abs(angleDelta(this.aimAngle, targetAngle));
    if (angleDiff <= FIRE_CONE_RAD) {
      this.firing = true;
      return { damagePerTick: params.damage * dt, target };
    }

    this.firing = false;
    return null;
  }

  emitPoint(originX: number, originY: number, radius: number): { x: number; y: number } {
    return {
      x: originX + Math.cos(this.aimAngle) * radius,
      y: originY + Math.sin(this.aimAngle) * radius,
    };
  }

  private loseTarget(cooldown: number): void {
    this.targetId = null;
    this.firing = false;
    this.cooldownRemaining = cooldown;
  }

  private findBestTarget(
    ox: number,
    oy: number,
    chunks: readonly ChunkTarget[],
    range: number,
  ): ChunkTarget | null {
    let best: ChunkTarget | null = null;
    let bestScore = Infinity;

    for (const chunk of chunks) {
      if (chunk.dead) continue;
      const dist = Phaser.Math.Distance.Between(ox, oy, chunk.x, chunk.y);
      if (dist > range) continue;

      const angle = Math.atan2(chunk.y - oy, chunk.x - ox);
      const angDiff = Math.abs(angleDelta(this.aimAngle, angle));
      const score = angDiff + (dist / range) * 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = chunk;
      }
    }

    return best;
  }
}

function angleDelta(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function rotateToward(from: number, to: number, maxStep: number): number {
  const delta = angleDelta(from, to);
  if (Math.abs(delta) <= maxStep) return to;
  return from + Math.sign(delta) * maxStep;
}
