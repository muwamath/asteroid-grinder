import Phaser from 'phaser';
import type { ChunkTarget } from './chunkTarget';

const DEG_TO_RAD = Math.PI / 180;
const FIRE_CONE_RAD = 10 * DEG_TO_RAD;
const MISSILE_RANGE = 400;
const MISSILE_MAX_LIFETIME_S = 10;

export interface MissileParams {
  fireInterval: number;
  damage: number;
  blastRadius: number;
  speed: number;
  homing: number;
}

export class MissileLauncher {
  aimAngle = -Math.PI / 2;
  targetId: string | null = null;
  fireCooldown: number;

  constructor(initialInterval: number) {
    this.fireCooldown = Math.random() * initialInterval;
  }

  /**
   * Run once per frame. Returns a fire command if the launcher should
   * spawn a projectile this frame, or null otherwise.
   */
  update(
    deltaMs: number,
    originX: number,
    originY: number,
    chunks: readonly ChunkTarget[],
    params: MissileParams,
  ): { dirX: number; dirY: number; targetId: string } | null {
    const dt = deltaMs / 1000;
    this.fireCooldown -= dt;

    let target: ChunkTarget | null = null;
    if (this.targetId) {
      target = chunks.find((c) => c.id === this.targetId && !c.dead) ?? null;
      if (target) {
        const dist = Phaser.Math.Distance.Between(originX, originY, target.x, target.y);
        if (dist > MISSILE_RANGE) target = null;
      }
      if (!target) this.targetId = null;
    }

    if (!target) {
      target = this.findBestTarget(originX, originY, chunks);
      if (!target) return null;
      this.targetId = target.id;
    }

    const intercept = leadIntercept(originX, originY, target, params.speed);
    const targetAngle = Math.atan2(intercept.y - originY, intercept.x - originX);
    const maxRot = 360 * DEG_TO_RAD * dt;
    this.aimAngle = rotateToward(this.aimAngle, targetAngle, maxRot);

    const angleDiff = Math.abs(angleDelta(this.aimAngle, targetAngle));
    if (angleDiff <= FIRE_CONE_RAD && this.fireCooldown <= 0) {
      this.fireCooldown = params.fireInterval;
      return {
        dirX: Math.cos(this.aimAngle),
        dirY: Math.sin(this.aimAngle),
        targetId: target.id,
      };
    }

    return null;
  }

  emitPoint(originX: number, originY: number, radius: number): { x: number; y: number } {
    return {
      x: originX + Math.cos(this.aimAngle) * radius,
      y: originY + Math.sin(this.aimAngle) * radius,
    };
  }

  private findBestTarget(
    ox: number,
    oy: number,
    chunks: readonly ChunkTarget[],
  ): ChunkTarget | null {
    let best: ChunkTarget | null = null;
    let bestScore = Infinity;

    for (const chunk of chunks) {
      if (chunk.dead) continue;
      const dist = Phaser.Math.Distance.Between(ox, oy, chunk.x, chunk.y);
      if (dist > MISSILE_RANGE) continue;

      const angle = Math.atan2(chunk.y - oy, chunk.x - ox);
      const angDiff = Math.abs(angleDelta(this.aimAngle, angle));
      const score = angDiff + (dist / MISSILE_RANGE) * 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = chunk;
      }
    }
    return best;
  }
}

function leadIntercept(
  ox: number,
  oy: number,
  target: ChunkTarget,
  missileSpeed: number,
): { x: number; y: number } {
  // ChunkTarget.vx/vy are in Matter units (px/tick @ 60Hz). Convert to px/s.
  const fps = 60;
  const vx = target.vx * fps;
  const vy = target.vy * fps;
  const rx = target.x - ox;
  const ry = target.y - oy;

  const a = vx * vx + vy * vy - missileSpeed * missileSpeed;
  const b = 2 * (rx * vx + ry * vy);
  const c = rx * rx + ry * ry;

  let t = 0;
  if (Math.abs(a) < 0.001) {
    if (Math.abs(b) > 0.001) t = -c / b;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sqrtDisc = Math.sqrt(disc);
      const t1 = (-b - sqrtDisc) / (2 * a);
      const t2 = (-b + sqrtDisc) / (2 * a);
      if (t1 > 0 && t2 > 0) t = Math.min(t1, t2);
      else if (t1 > 0) t = t1;
      else if (t2 > 0) t = t2;
    }
  }

  t = Phaser.Math.Clamp(t, 0, 5);
  return { x: target.x + vx * t, y: target.y + vy * t };
}

export class MissileProjectile {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  speed: number;
  damage: number;
  blastRadius: number;
  homing: number;
  targetId: string | null;
  age = 0;

  constructor(
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    speed: number,
    damage: number,
    blastRadius: number,
    homing: number,
    targetId: string,
  ) {
    this.x = x;
    this.y = y;
    this.dirX = dirX;
    this.dirY = dirY;
    this.speed = speed;
    this.damage = damage;
    this.blastRadius = blastRadius;
    this.homing = homing;
    this.targetId = targetId;
  }

  /**
   * Move the projectile. Returns a detonation point if it should explode.
   */
  update(
    deltaMs: number,
    chunks: readonly ChunkTarget[],
    channelLeft: number,
    channelRight: number,
    channelBottom: number,
  ): { x: number; y: number } | null {
    const dt = deltaMs / 1000;
    this.age += dt;

    if (this.age >= MISSILE_MAX_LIFETIME_S) {
      return { x: this.x, y: this.y };
    }

    if (this.homing > 0 && this.targetId) {
      const target = chunks.find((c) => c.id === this.targetId && !c.dead);
      if (target) {
        const toX = target.x - this.x;
        const toY = target.y - this.y;
        const len = Math.sqrt(toX * toX + toY * toY);
        if (len > 0.1) {
          const nx = toX / len;
          const ny = toY / len;
          const lerpAmt = this.homing * dt;
          this.dirX = this.dirX + (nx - this.dirX) * lerpAmt;
          this.dirY = this.dirY + (ny - this.dirY) * lerpAmt;
          const dl = Math.sqrt(this.dirX * this.dirX + this.dirY * this.dirY);
          if (dl > 0.001) {
            this.dirX /= dl;
            this.dirY /= dl;
          }
        }
      } else {
        this.targetId = null;
      }
    }

    this.x += this.dirX * this.speed * dt;
    this.y += this.dirY * this.speed * dt;

    if (this.x < channelLeft || this.x > channelRight || this.y < -100 || this.y > channelBottom) {
      return { x: this.x, y: this.y };
    }

    const halfChunk = 6;
    for (const chunk of chunks) {
      if (chunk.dead) continue;
      if (Math.abs(this.x - chunk.x) <= halfChunk && Math.abs(this.y - chunk.y) <= halfChunk) {
        return { x: this.x, y: this.y };
      }
    }

    return null;
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
