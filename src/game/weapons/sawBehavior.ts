import Phaser from 'phaser';
import type { ChunkTarget } from '../chunkTarget';
import type { CompoundAsteroid } from '../compoundAsteroid';
import type { EffectiveGameplayParams } from '../upgradeApplier';
import { BASE_PARAMS } from '../upgradeApplier';
import type { WeaponBehavior } from './weaponBehavior';

const ARBOR_RADIUS = 12;
const SAW_HIT_COOLDOWN_MS = 120;
const LAST_HIT_PRUNE_INTERVAL_MS = 1000;
const LAST_HIT_STALE_MS = 1000;

interface SceneWithDamage extends Phaser.Scene {
  damageLiveChunk(ast: CompoundAsteroid, chunkId: string, amount: number): boolean;
}

export class SawBehavior implements WeaponBehavior {
  readonly textureKey = 'arbor';
  readonly bodyRadius = ARBOR_RADIUS;

  private orbitAngle = 0;
  private blades: Phaser.Physics.Matter.Image[] = [];
  // Per-instance: each saw's direction is configured independently. Default
  // CW; set via setClockwise(false) on load or toggle().
  private _clockwise = true;
  // Key is `${asteroid.id}/${chunkId}` — chunkIds repeat across asteroids
  // (they're cell-local), so a bare chunkId would share cooldown across
  // unrelated asteroids. Entries older than LAST_HIT_STALE_MS are
  // pruned in update() to bound map growth.
  private lastHitAt = new Map<string, number>();
  private lastPruneAt = 0;
  private hitCount = 0;
  private killCount = 0;

  createTextures(scene: Phaser.Scene): void {
    if (!scene.textures.exists('arbor')) {
      const d = ARBOR_RADIUS * 2;
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0x8a8aa0);
      g.fillCircle(ARBOR_RADIUS, ARBOR_RADIUS, ARBOR_RADIUS);
      g.lineStyle(2, 0xc8c8dc);
      g.strokeCircle(ARBOR_RADIUS, ARBOR_RADIUS, ARBOR_RADIUS - 1);
      g.fillStyle(0x5a5a70);
      g.fillCircle(ARBOR_RADIUS, ARBOR_RADIUS, 4);
      g.generateTexture('arbor', d, d);
      g.destroy();
    }

    this.makeSawBladeTexture(scene, BASE_PARAMS.bladeRadius);
  }

  init(scene: Phaser.Scene, sprite: Phaser.Physics.Matter.Image, params: EffectiveGameplayParams): void {
    this.rebuildBlades(scene, sprite, params.bladeCount, params.bladeRadius);
  }

  update(
    scene: Phaser.Scene,
    sprite: Phaser.Physics.Matter.Image,
    delta: number,
    _chunks: readonly ChunkTarget[],
    params: EffectiveGameplayParams,
  ): void {
    const now = scene.time.now;
    if (now - this.lastPruneAt >= LAST_HIT_PRUNE_INTERVAL_MS) {
      const cutoff = now - LAST_HIT_STALE_MS;
      for (const [key, t] of this.lastHitAt) {
        if (t < cutoff) this.lastHitAt.delete(key);
      }
      this.lastPruneAt = now;
    }

    if (this.blades.length === 0) return;
    const dir = this._clockwise ? 1 : -1;
    this.orbitAngle += dir * (params.orbitSpeed * delta) / 1000;
    const bladeCount = this.blades.length;
    for (let i = 0; i < bladeCount; i++) {
      const phase = this.orbitAngle + (i * Math.PI * 2) / bladeCount;
      const sx = sprite.x + Math.cos(phase) * ARBOR_RADIUS;
      const sy = sprite.y + Math.sin(phase) * ARBOR_RADIUS;
      const blade = this.blades[i];
      blade.setPosition(sx, sy);
      blade.setRotation(blade.rotation + delta * params.bladeSpinSpeed);
    }
  }

  onUpgrade(
    scene: Phaser.Scene,
    sprite: Phaser.Physics.Matter.Image,
    prev: EffectiveGameplayParams,
    next: EffectiveGameplayParams,
  ): void {
    if (next.bladeCount !== prev.bladeCount || next.bladeRadius !== prev.bladeRadius) {
      if (next.bladeRadius !== prev.bladeRadius) {
        this.makeSawBladeTexture(scene, next.bladeRadius);
      }
      this.rebuildBlades(scene, sprite, next.bladeCount, next.bladeRadius);
    }
  }

  handleCompoundHit(
    asteroid: CompoundAsteroid,
    chunkId: string,
    weaponBody: MatterJS.BodyType,
    params: EffectiveGameplayParams,
    scene: Phaser.Scene,
  ): { hit: boolean; killed: boolean } {
    const chunk = asteroid.chunks.get(chunkId);
    if (!chunk) return { hit: false, killed: false };

    const now = (scene as Phaser.Scene & { time: Phaser.Time.Clock }).time.now;
    const key = `${asteroid.id}/${chunkId}`;
    const last = this.lastHitAt.get(key) ?? -Infinity;
    if (now - last < SAW_HIT_COOLDOWN_MS) return { hit: false, killed: false };
    this.lastHitAt.set(key, now);

    const sceneTyped = scene as SceneWithDamage;
    const killed = sceneTyped.damageLiveChunk(asteroid, chunkId, params.sawDamage);
    this.hitCount++;

    const cx = chunk.bodyPart.position.x;
    const cy = chunk.bodyPart.position.y;
    const bx = weaponBody.position.x;
    const by = weaponBody.position.y;
    const dx = cx - bx;
    const dy = cy - by;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0.1) {
      const dir = this._clockwise ? 1 : -1;
      const tx = (-dy / dist) * dir;
      const ty = (dx / dist) * dir;
      const strength = params.bladeSpinSpeed * params.bladeRadius * 0.0003;
      const matterScene = scene as Phaser.Scene & { matter: Phaser.Physics.Matter.MatterPhysics };
      matterScene.matter.body.applyForce(
        asteroid.body,
        { x: cx, y: cy },
        { x: tx * strength, y: ty * strength },
      );
    }

    for (let i = 0; i < 3; i++) {
      const s = scene.add.circle(cx, cy, 2, 0xffd166);
      const vx = (Math.random() - 0.5) * 80;
      const vy = (Math.random() - 0.5) * 80 - 20;
      scene.tweens.add({
        targets: s, x: cx + vx, y: cy + vy, alpha: 0,
        duration: 280, onComplete: () => s.destroy(),
      });
    }

    if (killed) this.killCount++;
    return { hit: true, killed };
  }

  destroy(): void {
    for (const blade of this.blades) blade.destroy();
    this.blades = [];
  }

  get clockwise(): boolean { return this._clockwise; }
  setClockwise(cw: boolean): void { this._clockwise = cw; }
  toggleClockwise(): void { this._clockwise = !this._clockwise; }

  get stats() { return { hits: this.hitCount, kills: this.killCount }; }

  private rebuildBlades(
    scene: Phaser.Scene,
    arbor: Phaser.Physics.Matter.Image,
    count: number,
    radius: number,
  ): void {
    for (const blade of this.blades) blade.destroy();
    this.blades = [];
    const instanceId = arbor.getData('instanceId') as string | undefined;
    const displaySize = radius * 2 + 4;
    const matterScene = scene as Phaser.Scene & { matter: Phaser.Physics.Matter.MatterPhysics };
    for (let i = 0; i < count; i++) {
      const blade = matterScene.matter.add.image(0, 0, 'saw-blade');
      blade.setDisplaySize(displaySize, displaySize);
      blade.setCircle(radius);
      blade.setStatic(true);
      blade.setIgnoreGravity(true);
      blade.setFrictionAir(0);
      blade.setDepth(0);
      blade.setData('kind', 'saw');
      blade.setData('instanceId', instanceId);
      this.blades.push(blade);
    }
  }

  private makeSawBladeTexture(scene: Phaser.Scene, radius: number): void {
    if (scene.textures.exists('saw-blade')) {
      scene.textures.remove('saw-blade');
    }
    const d = radius * 2 + 4;
    const cx = d / 2;
    const cy = d / 2;
    const r = radius;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    const colors = [0xdddde8, 0x555566];
    for (let i = 0; i < 4; i++) {
      const startAngle = (i * Math.PI) / 2;
      const endAngle = ((i + 1) * Math.PI) / 2;
      g.fillStyle(colors[i % 2]);
      g.beginPath();
      g.moveTo(cx, cy);
      g.arc(cx, cy, r, startAngle, endAngle, false);
      g.closePath();
      g.fillPath();
    }
    g.lineStyle(1, 0x888898);
    g.strokeCircle(cx, cy, r);
    g.fillStyle(0x3a3a4c);
    g.fillCircle(cx, cy, 2.5);
    g.generateTexture('saw-blade', d, d);
    g.destroy();
  }
}
