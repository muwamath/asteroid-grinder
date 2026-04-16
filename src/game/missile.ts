import Phaser from 'phaser';

const DEG_TO_RAD = Math.PI / 180;
const FIRE_CONE_RAD = 10 * DEG_TO_RAD;
const MISSILE_RANGE = 400;
const MISSILE_MAX_LIFETIME_S = 10;

export interface MissileParams {
  fireInterval: number;   // seconds between shots
  damage: number;         // AOE damage per missile
  blastRadius: number;    // px
  speed: number;          // px/s
  homing: number;         // tracking strength (0 = straight, 5 = sharp curves)
}

// ── Launcher ────────────────────────────────────────────────────────────

export class MissileLauncher {
  aimAngle = -Math.PI / 2;
  target: Phaser.Physics.Matter.Image | null = null;
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
    chunks: Set<Phaser.Physics.Matter.Image>,
    params: MissileParams,
  ): { dirX: number; dirY: number; target: Phaser.Physics.Matter.Image } | null {
    const dt = deltaMs / 1000;

    // ── cooldown ──
    this.fireCooldown -= dt;

    // ── validate target ──
    if (this.target) {
      if (!this.target.active || this.target.getData('dead')) {
        this.target = null;
      } else {
        const dist = Phaser.Math.Distance.Between(originX, originY, this.target.x, this.target.y);
        if (dist > MISSILE_RANGE) this.target = null;
      }
    }

    // ── acquire target ──
    if (!this.target) {
      this.target = this.findBestTarget(originX, originY, chunks);
      if (!this.target) return null;
    }

    // ── rotate toward lead intercept point ──
    const intercept = this.leadIntercept(
      originX, originY, this.target, params.speed,
    );
    const targetAngle = Math.atan2(intercept.y - originY, intercept.x - originX);
    const maxRot = 360 * DEG_TO_RAD * dt; // 360 deg/s
    this.aimAngle = rotateToward(this.aimAngle, targetAngle, maxRot);

    // ── fire if aimed and cooldown ready ──
    const angleDiff = Math.abs(angleDelta(this.aimAngle, targetAngle));
    if (angleDiff <= FIRE_CONE_RAD && this.fireCooldown <= 0) {
      this.fireCooldown = params.fireInterval;
      return {
        dirX: Math.cos(this.aimAngle),
        dirY: Math.sin(this.aimAngle),
        target: this.target,
      };
    }

    return null;
  }

  /** Barrel tip position. */
  emitPoint(originX: number, originY: number, radius: number): { x: number; y: number } {
    return {
      x: originX + Math.cos(this.aimAngle) * radius,
      y: originY + Math.sin(this.aimAngle) * radius,
    };
  }

  private findBestTarget(
    ox: number,
    oy: number,
    chunks: Set<Phaser.Physics.Matter.Image>,
  ): Phaser.Physics.Matter.Image | null {
    let best: Phaser.Physics.Matter.Image | null = null;
    let bestScore = Infinity;

    for (const chunk of chunks) {
      if (!chunk.active || chunk.getData('dead')) continue;
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

  /**
   * Quadratic intercept: where to aim so missile meets the moving target.
   * Falls back to direct aim if no solution.
   */
  private leadIntercept(
    ox: number,
    oy: number,
    target: Phaser.Physics.Matter.Image,
    missileSpeed: number,
  ): { x: number; y: number } {
    const body = target.body as MatterJS.BodyType;
    const tvx = body.velocity.x;
    const tvy = body.velocity.y;
    const rx = target.x - ox;
    const ry = target.y - oy;

    // Scale velocity from px/tick to px/s (Matter runs at ~60hz)
    const fps = 60;
    const vx = tvx * fps;
    const vy = tvy * fps;
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

    return {
      x: target.x + vx * t,
      y: target.y + vy * t,
    };
  }
}

// ── Projectile ──────────────────────────────────────────────────────────

export class MissileProjectile {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  speed: number;
  damage: number;
  blastRadius: number;
  homing: number;
  target: Phaser.Physics.Matter.Image | null;
  age = 0;
  alive = true;

  constructor(
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    speed: number,
    damage: number,
    blastRadius: number,
    homing: number,
    target: Phaser.Physics.Matter.Image,
  ) {
    this.x = x;
    this.y = y;
    this.dirX = dirX;
    this.dirY = dirY;
    this.speed = speed;
    this.damage = damage;
    this.blastRadius = blastRadius;
    this.homing = homing;
    this.target = target;
  }

  /**
   * Move the projectile. Returns a detonation point if it should explode,
   * or null if still in flight.
   */
  update(
    deltaMs: number,
    chunks: Set<Phaser.Physics.Matter.Image>,
    channelLeft: number,
    channelRight: number,
  ): { x: number; y: number } | null {
    const dt = deltaMs / 1000;
    this.age += dt;

    // ── timeout ──
    if (this.age >= MISSILE_MAX_LIFETIME_S) {
      this.alive = false;
      return { x: this.x, y: this.y };
    }

    // ── homing ──
    if (this.homing > 0 && this.target && this.target.active && !this.target.getData('dead')) {
      const toX = this.target.x - this.x;
      const toY = this.target.y - this.y;
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
    }

    // ── move ──
    this.x += this.dirX * this.speed * dt;
    this.y += this.dirY * this.speed * dt;

    // ── wall detonation ──
    if (this.x < channelLeft || this.x > channelRight || this.y < -100 || this.y > 800) {
      this.alive = false;
      return { x: this.x, y: this.y };
    }

    // ── contact detonation: AABB overlap with any live chunk ──
    const halfChunk = 6; // CHUNK_PIXEL_SIZE / 2
    for (const chunk of chunks) {
      if (!chunk.active || chunk.getData('dead')) continue;
      if (Math.abs(this.x - chunk.x) <= halfChunk && Math.abs(this.y - chunk.y) <= halfChunk) {
        this.alive = false;
        return { x: this.x, y: this.y };
      }
    }

    return null;
  }
}

// ── Shared math ─────────────────────────────────────────────────────────

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
