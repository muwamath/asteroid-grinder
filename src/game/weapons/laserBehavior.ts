import Phaser from 'phaser';
import { Laser } from '../laser';
import type { EffectiveGameplayParams } from '../upgradeApplier';
import type { WeaponBehavior } from './weaponBehavior';
import { damageChunk } from './weaponBehavior';

const TURRET_RADIUS = 10;

export class LaserBehavior implements WeaponBehavior {
  readonly textureKey = 'laser-turret';
  readonly bodyRadius = TURRET_RADIUS;
  readonly blocksChunks = true;

  private laser!: Laser;
  private beamGfx!: Phaser.GameObjects.Graphics;

  createTextures(scene: Phaser.Scene): void {
    const s = TURRET_RADIUS * 2;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x442222);
    g.fillRect(0, 0, s, s);
    g.fillStyle(0xff3333);
    g.fillRect(0, 0, s, 4);
    g.lineStyle(1, 0x663333);
    g.strokeRect(0.5, 0.5, s - 1, s - 1);
    g.generateTexture('laser-turret', s, s);
    g.destroy();
  }

  init(scene: Phaser.Scene, _sprite: Phaser.Physics.Matter.Image, params: EffectiveGameplayParams): void {
    this.laser = new Laser(params.laserCooldown);
    this.beamGfx = scene.add.graphics();
    this.beamGfx.setDepth(2);
  }

  update(
    _scene: Phaser.Scene,
    sprite: Phaser.Physics.Matter.Image,
    delta: number,
    chunks: Set<Phaser.Physics.Matter.Image>,
    params: EffectiveGameplayParams,
  ): void {
    const dmg = this.laser.update(delta, sprite.x, sprite.y, chunks, {
      aimSpeed: params.laserAimSpeed,
      range: params.laserRange,
      damage: params.laserDamage,
      cooldown: params.laserCooldown,
    });

    sprite.setRotation(this.laser.aimAngle + Math.PI / 2);

    this.beamGfx.clear();
    if (this.laser.firing && this.laser.target && this.laser.target.active) {
      const emit = this.laser.emitPoint(sprite.x, sprite.y, TURRET_RADIUS);
      this.beamGfx.lineStyle(2, 0xff3333, 0.8);
      this.beamGfx.beginPath();
      this.beamGfx.moveTo(emit.x, emit.y);
      this.beamGfx.lineTo(this.laser.target.x, this.laser.target.y);
      this.beamGfx.strokePath();

      if (dmg > 0) {
        damageChunk(this.laser.target, dmg);
      }
    }
  }

  onUpgrade(): void {
    // Laser params are read live each frame — no rebuild needed.
  }

  destroy(): void {
    this.beamGfx?.destroy();
  }
}
