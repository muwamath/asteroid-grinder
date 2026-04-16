import Phaser from 'phaser';
import type { ChunkTarget } from '../chunkTarget';
import type { CompoundAsteroid } from '../compoundAsteroid';
import type { EffectiveGameplayParams } from '../upgradeApplier';

export interface WeaponRawAccess {
  readonly liveAsteroids: readonly CompoundAsteroid[];
  readonly deadChunks: Iterable<Phaser.Physics.Matter.Image>;
}

export interface WeaponBehavior {
  readonly textureKey: string;
  readonly bodyRadius: number;

  createTextures(scene: Phaser.Scene): void;

  init(scene: Phaser.Scene, sprite: Phaser.Physics.Matter.Image, params: EffectiveGameplayParams): void;

  update(
    scene: Phaser.Scene,
    sprite: Phaser.Physics.Matter.Image,
    delta: number,
    chunks: readonly ChunkTarget[],
    params: EffectiveGameplayParams,
    raw?: WeaponRawAccess,
  ): void;

  onUpgrade(
    scene: Phaser.Scene,
    sprite: Phaser.Physics.Matter.Image,
    prev: EffectiveGameplayParams,
    next: EffectiveGameplayParams,
  ): void;

  handleCompoundHit?(
    asteroid: CompoundAsteroid,
    chunkId: string,
    weaponBody: MatterJS.BodyType,
    params: EffectiveGameplayParams,
    scene: Phaser.Scene,
  ): { hit: boolean; killed: boolean };

  destroy(): void;
}
