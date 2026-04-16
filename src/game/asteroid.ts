import Phaser from 'phaser';
import type { AsteroidShape, ChunkShape } from './shape';
import { canonicalEdge, cellKey } from './shape';

function lightenColor(color: number, amount: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return (lr << 16) | (lg << 8) | lb;
}

export const CHUNK_PIXEL_SIZE = 12;

interface ChunkState {
  image: Phaser.Physics.Matter.Image;
  hp: number;
  maxHp: number;
  dead: boolean;
  baseColor: number;
  deadColor: number;
}

const TEXTURE_KEY_BY_SHAPE: Record<ChunkShape, string> = {
  square: 'chunk-square',
  triNE: 'chunk-tri-NE',
  triNW: 'chunk-tri-NW',
  triSE: 'chunk-tri-SE',
  triSW: 'chunk-tri-SW',
};

export class Asteroid {
  private readonly scene: Phaser.Scene;
  // Keyed by chunkId (not cellKey) to support multiple chunks per cell.
  private readonly chunks = new Map<string, ChunkState>();
  private readonly adjacency = new Map<string, Set<string>>();
  private readonly constraintsByEdge = new Map<string, unknown[]>();

  constructor(
    scene: Phaser.Scene,
    shape: AsteroidShape,
    spawnX: number,
    spawnY: number,
    maxHpPerChunk: number,
    color: number,
    chunkRegistry: Set<Phaser.Physics.Matter.Image>,
  ) {
    this.scene = scene;

    // Clone adjacency into a mutable structure the asteroid owns.
    for (const [k, v] of shape.adjacency) {
      this.adjacency.set(k, new Set(v));
    }

    // Center the asteroid cloud on (spawnX, spawnY) via the cell centroid.
    let sumX = 0;
    let sumY = 0;
    for (const c of shape.cells) {
      sumX += c.x;
      sumY += c.y;
    }
    const avgX = sumX / shape.cells.length;
    const avgY = sumY / shape.cells.length;
    const originX = spawnX - avgX * CHUNK_PIXEL_SIZE;
    const originY = spawnY + avgY * CHUNK_PIXEL_SIZE;

    // Spawn a Matter.Image for every chunk entry.
    for (const [, entries] of shape.chunksByCell) {
      for (const entry of entries) {
        const wx = originX + entry.cell.x * CHUNK_PIXEL_SIZE;
        const wy = originY - entry.cell.y * CHUNK_PIXEL_SIZE;

        const image = scene.matter.add.image(wx, wy, TEXTURE_KEY_BY_SHAPE[entry.shape]);
        image.setRectangle(CHUNK_PIXEL_SIZE, CHUNK_PIXEL_SIZE);
        image.setTint(color);
        image.setMass(0.25);
        image.setFriction(0.1);
        image.setFrictionAir(0.005);
        image.setBounce(0.05);
        (image.body as unknown as { slop: number }).slop = 0.005;
        image.setData('kind', 'chunk');
        image.setData('asteroid', this);
        image.setData('chunkId', entry.chunkId);
        image.setData('hp', maxHpPerChunk);
        image.setData('maxHp', maxHpPerChunk);
        image.setData('dead', false);

        this.chunks.set(entry.chunkId, {
          image,
          hp: maxHpPerChunk,
          maxHp: maxHpPerChunk,
          dead: false,
          baseColor: color,
          deadColor: lightenColor(color, 0.35),
        });
        chunkRegistry.add(image);
      }
    }

    // Weld each adjacent pair with two rigid constraints.
    const seen = new Set<string>();
    for (const [aId, neighbors] of this.adjacency) {
      for (const bId of neighbors) {
        const edge = canonicalEdge(aId, bId);
        if (seen.has(edge)) continue;
        seen.add(edge);

        const a = this.chunks.get(aId);
        const b = this.chunks.get(bId);
        if (!a || !b) continue;

        const constraints = this.weldBodies(a.image, b.image);
        this.constraintsByEdge.set(edge, constraints);
      }
    }
  }

  damageChunkByImage(
    image: Phaser.Physics.Matter.Image,
    amount: number,
  ): { hp: number; killed: boolean; key: string | null } {
    const chunkId = image.getData('chunkId') as string | undefined;
    if (!chunkId) return { hp: 0, killed: false, key: null };
    const state = this.chunks.get(chunkId);
    if (!state || state.dead) return { hp: 0, killed: false, key: chunkId };

    state.hp -= amount;
    image.setData('hp', state.hp);

    if (state.hp <= 0) {
      state.dead = true;
      image.setData('dead', true);
      image.setTint(state.deadColor);
      image.setScale(0.8);
      this.detachChunk(chunkId);
      return { hp: 0, killed: true, key: chunkId };
    }

    return { hp: state.hp, killed: false, key: chunkId };
  }

  private detachChunk(chunkId: string): void {
    const neighbors = this.adjacency.get(chunkId);
    if (!neighbors) return;

    for (const nbId of neighbors) {
      const edge = canonicalEdge(chunkId, nbId);
      const cs = this.constraintsByEdge.get(edge);
      if (cs) {
        for (const c of cs) {
          const world = this.scene.matter.world as unknown as {
            remove: (body: unknown) => void;
          };
          world.remove(c);
        }
        this.constraintsByEdge.delete(edge);
      }
      this.adjacency.get(nbId)?.delete(chunkId);
    }

    this.adjacency.delete(chunkId);
  }

  private weldBodies(
    a: Phaser.Physics.Matter.Image,
    b: Phaser.Physics.Matter.Image,
  ): unknown[] {
    const half = CHUNK_PIXEL_SIZE / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;

    const mkConstraint = (
      pointA: { x: number; y: number },
      pointB: { x: number; y: number },
    ): unknown => {
      const factory = this.scene.matter.add as unknown as {
        constraint: (
          bodyA: unknown,
          bodyB: unknown,
          length: number,
          stiffness: number,
          options: { pointA: { x: number; y: number }; pointB: { x: number; y: number } },
        ) => unknown;
      };
      return factory.constraint(a, b, 0, 1, { pointA, pointB });
    };

    // For chunks in the same cell (paired triangles), dx and dy are both 0.
    // Use a center-to-center constraint.
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
      return [mkConstraint({ x: 0, y: 0 }, { x: 0, y: 0 })];
    }

    if (Math.abs(dx) > Math.abs(dy)) {
      const sign = dx > 0 ? 1 : -1;
      return [
        mkConstraint({ x: sign * half, y: -half }, { x: -sign * half, y: -half }),
        mkConstraint({ x: sign * half, y: half }, { x: -sign * half, y: half }),
      ];
    }

    const sign = dy > 0 ? 1 : -1;
    return [
      mkConstraint({ x: -half, y: sign * half }, { x: -half, y: -sign * half }),
      mkConstraint({ x: half, y: sign * half }, { x: half, y: -sign * half }),
    ];
  }

  static cellKeyFor(x: number, y: number): string {
    return cellKey(x, y);
  }
}
