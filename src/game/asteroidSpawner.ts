import type Phaser from 'phaser';
import { Asteroid } from './asteroid';
import { CircularShapeGenerator } from './circularShapeGenerator';
import { randomPaletteColor } from './palette';
import { SeededRng } from './rng';

export interface AsteroidSpawnParams {
  readonly minChunks: number;
  readonly maxChunks: number;
  readonly minTriangleProbability: number;
  readonly maxTriangleProbability: number;
  readonly maxHpPerChunk: number;
}

export const DEFAULT_SPAWN_PARAMS: AsteroidSpawnParams = {
  minChunks: 9,
  maxChunks: 14,
  minTriangleProbability: 0.15,
  maxTriangleProbability: 0.55,
  maxHpPerChunk: 3,
};

export class AsteroidSpawner {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly chunkRegistry: Set<Phaser.Physics.Matter.Image>,
    private readonly params: AsteroidSpawnParams = DEFAULT_SPAWN_PARAMS,
  ) {}

  spawnOne(worldX: number, worldY: number): Asteroid {
    const seed = (Math.random() * 0xffffffff) >>> 0 || 1;
    const rng = new SeededRng(seed);

    const span = Math.max(0, this.params.maxChunks - this.params.minChunks);
    const count = this.params.minChunks + rng.nextInt(span + 1);

    const triProb =
      this.params.minTriangleProbability +
      rng.next() * (this.params.maxTriangleProbability - this.params.minTriangleProbability);

    const color = randomPaletteColor(() => rng.next());

    const generator = new CircularShapeGenerator(rng);
    const shape = generator.generate(count, triProb);

    return new Asteroid(
      this.scene,
      shape,
      worldX,
      worldY,
      this.params.maxHpPerChunk,
      color,
      this.chunkRegistry,
    );
  }
}
