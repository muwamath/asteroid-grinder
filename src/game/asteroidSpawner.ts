import type Phaser from 'phaser';
import { CompoundAsteroid } from './compoundAsteroid';
import { CircularShapeGenerator } from './circularShapeGenerator';
import { MATERIALS, sampleTieredMaterial, type Material } from './materials';
import { SeededRng } from './rng';

export interface AsteroidSpawnParams {
  readonly minChunks: number;
  readonly maxChunks: number;
  readonly hpMultiplier: number;
  readonly qualityLevel: number;
  readonly fallSpeedMultiplier: number;
  readonly fillerFraction: number;
}

const DIRT = MATERIALS[0]; // t1 filler

export class AsteroidSpawner {
  private counter = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly rootSeed?: number) {}

  spawnOne(worldX: number, worldY: number, params: AsteroidSpawnParams): CompoundAsteroid {
    const seed = this.rootSeed !== undefined
      ? ((this.rootSeed ^ (this.counter++ * 0x9e3779b1)) >>> 0) || 1
      : ((Math.random() * 0xffffffff) >>> 0) || 1;
    const rng = new SeededRng(seed);

    const span = Math.max(0, params.maxChunks - params.minChunks);
    const count = params.minChunks + rng.nextInt(span + 1);

    const generator = new CircularShapeGenerator(rng);
    const shape = generator.generate(count);

    const materialsByChunk = new Map<string, Material>();
    for (const entries of shape.chunksByCell.values()) {
      for (const entry of entries) {
        const isCore = entry.chunkId === shape.coreChunkId;
        if (isCore) {
          // Cores always tiered — guarantees Shards on vault kill.
          materialsByChunk.set(entry.chunkId, sampleTieredMaterial(params.qualityLevel, rng));
        } else if (rng.next() < params.fillerFraction) {
          materialsByChunk.set(entry.chunkId, DIRT);
        } else {
          materialsByChunk.set(entry.chunkId, sampleTieredMaterial(params.qualityLevel, rng));
        }
      }
    }

    return new CompoundAsteroid(
      this.scene, shape, worldX, worldY, params.hpMultiplier, materialsByChunk,
      params.fallSpeedMultiplier,
    );
  }
}
