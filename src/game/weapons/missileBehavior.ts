import Phaser from 'phaser';
import { MissileLauncher, MissileProjectile } from '../missile';
import type { EffectiveGameplayParams } from '../upgradeApplier';
import type { WeaponBehavior } from './weaponBehavior';
import { damageChunk } from './weaponBehavior';

const TURRET_RADIUS = 10;
const DEATH_LINE_Y = 652;

export class MissileBehavior implements WeaponBehavior {
  readonly textureKey = 'missile-turret';
  readonly bodyRadius = TURRET_RADIUS;
  readonly blocksChunks = true;

  private launcher!: MissileLauncher;
  private missiles: Array<{ proj: MissileProjectile; image: Phaser.GameObjects.Rectangle }> = [];

  createTextures(scene: Phaser.Scene): void {
    const s = TURRET_RADIUS * 2;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x224422);
    g.fillRect(0, 0, s, s);
    g.fillStyle(0x33ff33);
    g.fillRect(0, 0, s, 4);
    g.lineStyle(1, 0x336633);
    g.strokeRect(0.5, 0.5, s - 1, s - 1);
    g.generateTexture('missile-turret', s, s);
    g.destroy();
  }

  init(_scene: Phaser.Scene, _sprite: Phaser.Physics.Matter.Image, params: EffectiveGameplayParams): void {
    this.launcher = new MissileLauncher(params.missileFireInterval);
  }

  update(
    scene: Phaser.Scene,
    sprite: Phaser.Physics.Matter.Image,
    delta: number,
    chunks: Set<Phaser.Physics.Matter.Image>,
    params: EffectiveGameplayParams,
  ): void {
    const missileParams = {
      fireInterval: params.missileFireInterval,
      damage: params.missileDamage,
      blastRadius: params.missileBlastRadius,
      speed: params.missileSpeed,
      homing: params.missileHoming,
    };

    const fireCmd = this.launcher.update(delta, sprite.x, sprite.y, chunks, missileParams);
    sprite.setRotation(this.launcher.aimAngle + Math.PI / 2);

    if (fireCmd) {
      const emit = this.launcher.emitPoint(sprite.x, sprite.y, TURRET_RADIUS);
      const proj = new MissileProjectile(
        emit.x, emit.y,
        fireCmd.dirX, fireCmd.dirY,
        missileParams.speed, missileParams.damage, missileParams.blastRadius, missileParams.homing,
        fireCmd.target,
      );
      const image = scene.add.rectangle(emit.x, emit.y, 8, 4, 0x33ff33);
      image.setDepth(3);
      this.missiles.push({ proj, image });
    }

    // Update projectiles
    const halfW = scene.scale.width / 2;
    const halfCh = params.channelHalfWidth;
    const channelLeft = halfW - halfCh;
    const channelRight = halfW + halfCh;

    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      const detonation = m.proj.update(delta, chunks, channelLeft, channelRight, DEATH_LINE_Y);

      if (detonation) {
        const r2 = m.proj.blastRadius * m.proj.blastRadius;
        for (const chunk of chunks) {
          if (!chunk.active || chunk.getData('dead')) continue;
          const dx = chunk.x - detonation.x;
          const dy = chunk.y - detonation.y;
          if (dx * dx + dy * dy <= r2) {
            damageChunk(chunk, m.proj.damage);
          }
        }
        const flash = scene.add.circle(detonation.x, detonation.y, m.proj.blastRadius, 0xff8833, 0.4);
        scene.tweens.add({
          targets: flash, alpha: 0, scale: 1.5,
          duration: 200, onComplete: () => flash.destroy(),
        });
        m.image.destroy();
        this.missiles.splice(i, 1);
      } else {
        m.image.setPosition(m.proj.x, m.proj.y);
        m.image.setRotation(Math.atan2(m.proj.dirY, m.proj.dirX));
      }
    }
  }

  onUpgrade(): void {
    // Missile params are read live each frame.
  }

  destroy(): void {
    for (const m of this.missiles) m.image.destroy();
    this.missiles = [];
  }
}
