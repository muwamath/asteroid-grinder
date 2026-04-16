import Phaser from 'phaser';
import type { ChunkTarget } from '../chunkTarget';
import type { CompoundAsteroid } from '../compoundAsteroid';
import { gameplayState } from '../gameplayState';
import type { EffectiveGameplayParams } from '../upgradeApplier';
import { BASE_PARAMS } from '../upgradeApplier';
import type { WeaponBehavior } from './weaponBehavior';

const ARBOR_RADIUS = 20;
const SAW_HIT_COOLDOWN_MS = 120;

interface SceneWithDamage extends Phaser.Scene {
  damageLiveChunk(ast: CompoundAsteroid, chunkId: string, amount: number): boolean;
}

export class SawBehavior implements WeaponBehavior {
  readonly textureKey = 'arbor';
  readonly bodyRadius = ARBOR_RADIUS;

  private orbitAngle = 0;
  private blades: Phaser.Physics.Matter.Image[] = [];
  private lastHitAt = new Map<string, number>();
  private hitCount = 0;
  private killCount = 0;

  createTextures(scene: Phaser.Scene): void {
    // Arbor texture
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

    // Initial blade texture
    this.makeSawBladeTexture(scene, BASE_PARAMS.bladeRadius);
  }

  init(scene: Phaser.Scene, _sprite: Phaser.Physics.Matter.Image, params: EffectiveGameplayParams): void {
    this.rebuildBlades(scene, params.bladeCount, params.bladeRadius);
  }

  update(
    _scene: Phaser.Scene,
    sprite: Phaser.Physics.Matter.Image,
    delta: number,
    _chunks: readonly ChunkTarget[],
    params: EffectiveGameplayParams,
  ): void {
    if (this.blades.length === 0) return;
    const dir = gameplayState.sawClockwise ? 1 : -1;
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
    _sprite: Phaser.Physics.Matter.Image,
    prev: EffectiveGameplayParams,
    next: EffectiveGameplayParams,
  ): void {
    if (next.bladeCount !== prev.bladeCount || next.bladeRadius !== prev.bladeRadius) {
      if (next.bladeRadius !== prev.bladeRadius) {
        this.makeSawBladeTexture(scene, next.bladeRadius);
      }
      this.rebuildBlades(scene, next.bladeCount, next.bladeRadius);
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
    const last = this.lastHitAt.get(chunkId) ?? -Infinity;
    if (now - last < SAW_HIT_COOLDOWN_MS) return { hit: false, killed: false };
    this.lastHitAt.set(chunkId, now);

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
      const dir = gameplayState.sawClockwise ? 1 : -1;
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

  get stats() { return { hits: this.hitCount, kills: this.killCount }; }

  private rebuildBlades(scene: Phaser.Scene, count: number, radius: number): void {
    for (const blade of this.blades) blade.destroy();
    this.blades = [];
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
