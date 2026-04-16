import type Phaser from 'phaser';
import { Asteroid } from './asteroid';
import { CircularShapeGenerator } from './circularShapeGenerator';
import { randomPaletteColor } from './palette';
import { SeededRng } from './rng';

export interface AsteroidSpawnParams {
  readonly minChunks: number;
  readonly maxChunks: number;
  readonly maxHpPerChunk: number;
}

const MIN_TRIANGLE_PROBABILITY = 0.15;
const MAX_TRIANGLE_PROBABILITY = 0.55;

export class AsteroidSpawner {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly chunkRegistry: Set<Phaser.Physics.Matter.Image>,
  ) {}

  spawnOne(worldX: number, worldY: number, params: AsteroidSpawnParams): Asteroid {
    const seed = (Math.random() * 0xffffffff) >>> 0 || 1;
    const rng = new SeededRng(seed);

    const span = Math.max(0, params.maxChunks - params.minChunks);
    const count = params.minChunks + rng.nextInt(span + 1);

    const triProb =
      MIN_TRIANGLE_PROBABILITY +
      rng.next() * (MAX_TRIANGLE_PROBABILITY - MIN_TRIANGLE_PROBABILITY);

    const color = randomPaletteColor(() => rng.next());

    const generator = new CircularShapeGenerator(rng);
    const shape = generator.generate(count, triProb);

    return new Asteroid(
      this.scene,
      shape,
      worldX,
      worldY,
      params.maxHpPerChunk,
      color,
      this.chunkRegistry,
    );
  }
}
