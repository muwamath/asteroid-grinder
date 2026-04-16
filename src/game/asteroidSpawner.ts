import type Phaser from 'phaser';
import { CompoundAsteroid } from './compoundAsteroid';
import { CircularShapeGenerator } from './circularShapeGenerator';
import { chooseMaterial, type Material } from './materials';
import { SeededRng } from './rng';

export interface AsteroidSpawnParams {
  readonly minChunks: number;
  readonly maxChunks: number;
  readonly hpMultiplier: number;
  readonly qualityLevel: number;
  readonly fallSpeedMultiplier: number;
}

export class AsteroidSpawner {
  constructor(private readonly scene: Phaser.Scene) {}

  spawnOne(worldX: number, worldY: number, params: AsteroidSpawnParams): CompoundAsteroid {
    const seed = (Math.random() * 0xffffffff) >>> 0 || 1;
    const rng = new SeededRng(seed);

    const span = Math.max(0, params.maxChunks - params.minChunks);
    const count = params.minChunks + rng.nextInt(span + 1);

    const generator = new CircularShapeGenerator(rng);
    const shape = generator.generate(count);

    const materialsByChunk = new Map<string, Material>();
    for (const entries of shape.chunksByCell.values()) {
      for (const entry of entries) {
        materialsByChunk.set(entry.chunkId, chooseMaterial(params.qualityLevel, rng));
      }
    }

    return new CompoundAsteroid(
      this.scene, shape, worldX, worldY, params.hpMultiplier, materialsByChunk,
    );
  }
}
