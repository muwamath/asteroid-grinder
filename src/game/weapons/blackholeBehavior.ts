import Phaser from 'phaser';
import { BlackHole } from '../blackhole';
import type { EffectiveGameplayParams } from '../upgradeApplier';
import type { WeaponBehavior } from './weaponBehavior';

const TURRET_RADIUS = 10;

export class BlackholeBehavior implements WeaponBehavior {
  readonly textureKey = 'blackhole-turret';
  readonly bodyRadius = TURRET_RADIUS;
  readonly blocksChunks = false;  // black hole pulls chunks in, not out

  private bh!: BlackHole;
  private rangeGfx!: Phaser.GameObjects.Arc;

  createTextures(scene: Phaser.Scene): void {
    const d = TURRET_RADIUS * 2;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x260540);
    g.fillCircle(TURRET_RADIUS, TURRET_RADIUS, TURRET_RADIUS);
    g.lineStyle(1, 0x6611aa);
    g.strokeCircle(TURRET_RADIUS, TURRET_RADIUS, TURRET_RADIUS - 1);
    g.generateTexture('blackhole-turret', d, d);
    g.destroy();
  }

  init(scene: Phaser.Scene, sprite: Phaser.Physics.Matter.Image, params: EffectiveGameplayParams): void {
    this.bh = new BlackHole();
    this.rangeGfx = scene.add.circle(sprite.x, sprite.y, params.blackholePullRange, 0x6611aa, 0.06);
    this.rangeGfx.setStrokeStyle(1, 0x6611aa, 0.15);
    this.rangeGfx.setDepth(0);
  }

  update(
    _scene: Phaser.Scene,
    sprite: Phaser.Physics.Matter.Image,
    delta: number,
    chunks: Set<Phaser.Physics.Matter.Image>,
    params: EffectiveGameplayParams,
  ): void {
    this.bh.update(delta, sprite.x, sprite.y, chunks, {
      pullRange: params.blackholePullRange,
      pullForce: params.blackholePullForce,
      coreSize: params.blackholeCoreSize,
      coreDamage: params.blackholeCoreDamage,
      maxTargets: params.blackholeMaxTargets,
    });

    this.rangeGfx.setPosition(sprite.x, sprite.y);
    this.rangeGfx.setRadius(params.blackholePullRange);
  }

  onUpgrade(): void {
    // Blackhole params are read live each frame.
  }

  destroy(): void {
    this.rangeGfx?.destroy();
  }
}
