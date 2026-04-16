import Phaser from 'phaser';
import type { Asteroid } from '../asteroid';
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

  /** Handle a saw-blade-to-chunk collision (only saw implements this). */
  handleCollision?(
    chunk: Phaser.Physics.Matter.Image,
    blade: Phaser.Physics.Matter.Image,
    params: EffectiveGameplayParams,
    scene: Phaser.Scene,
  ): { hit: boolean; killed: boolean };

  /** Return extra bodies that participate in barrier enforcement (e.g. saw blades). */
  getBarrierBodies?(): Array<{ x: number; y: number; radius: number }>;

  /** Clean up weapon-specific visuals and state. */
  destroy(): void;
}

/** Helper: damage a chunk via its asteroid reference. */
export function damageChunk(
  chunk: Phaser.Physics.Matter.Image,
  amount: number,
): { hp: number; killed: boolean; key: string | null } {
  const asteroid = chunk.getData('asteroid') as Asteroid | undefined;
  if (!asteroid) return { hp: 0, killed: false, key: null };
  return asteroid.damageChunkByImage(chunk, amount);
}
