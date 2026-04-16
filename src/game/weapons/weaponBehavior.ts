import Phaser from 'phaser';
import type { Asteroid } from '../asteroid';
import type { CompoundAsteroid } from '../compoundAsteroid';
import type { EffectiveGameplayParams } from '../upgradeApplier';

export interface WeaponBehavior {
  readonly textureKey: string;
  readonly bodyRadius: number;
  /** If true, barrier enforcement pushes chunks away from this weapon. */
  readonly blocksChunks: boolean;

  /** Generate procedural textures. Called once in preload(). */
  createTextures(scene: Phaser.Scene): void;

  /** Set up weapon-specific state + visuals after sprite is created. */
  init(scene: Phaser.Scene, sprite: Phaser.Physics.Matter.Image, params: EffectiveGameplayParams): void;

  /** Per-frame update: targeting, damage, visuals. */
  update(
    scene: Phaser.Scene,
    sprite: Phaser.Physics.Matter.Image,
    delta: number,
    chunks: Set<Phaser.Physics.Matter.Image>,
    params: EffectiveGameplayParams,
  ): void;

  /** React to upgrade level changes. */
  onUpgrade(
    scene: Phaser.Scene,
    sprite: Phaser.Physics.Matter.Image,
    prev: EffectiveGameplayParams,
    next: EffectiveGameplayParams,
  ): void;

  /** Handle a collision between a weapon body and a compound-asteroid chunk part. */
  handleCompoundHit?(
    asteroid: CompoundAsteroid,
    chunkId: string,
    weaponBody: MatterJS.BodyType,
    params: EffectiveGameplayParams,
    scene: Phaser.Scene,
  ): { hit: boolean; killed: boolean };

  /** Return extra bodies that participate in barrier enforcement (e.g. saw blades). */
  getBarrierBodies?(): Array<{ x: number; y: number; radius: number }>;

  /** Clean up weapon-specific visuals and state. */
  destroy(): void;
}

/**
 * Legacy helper used by laser/missile until Task 9 migrates them to the
 * ChunkTarget-based API. Loose dead chunks retain `data('asteroid')` for
 * backwards compatibility during the transition.
 */
export function damageChunk(
  chunk: Phaser.Physics.Matter.Image,
  amount: number,
): { hp: number; killed: boolean; key: string | null } {
  const asteroid = chunk.getData('asteroid') as Asteroid | undefined;
  if (!asteroid) return { hp: 0, killed: false, key: null };
  return asteroid.damageChunkByImage(chunk, amount);
}
