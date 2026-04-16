import Phaser from 'phaser';
import type { AsteroidShape } from './shape';
import { type Material, textureKeyFor } from './materials';

export const CHUNK_PIXEL_SIZE = 12;

export interface ChunkPart {
  readonly chunkId: string;
  readonly material: Material;
  readonly isCore: boolean;
  localOffset: { x: number; y: number };
  bodyPart: MatterJS.BodyType;
  sprite: Phaser.GameObjects.Image;
  hp: number;
  readonly maxHp: number;
}

export interface ChunkPartPlugin {
  readonly kind: 'chunk';
  readonly asteroid: CompoundAsteroid;
  readonly chunkId: string;
}

export class CompoundAsteroid {
  readonly chunks = new Map<string, ChunkPart>();
  readonly adjacency = new Map<string, Set<string>>();
  private compoundBody!: MatterJS.BodyType;
  private readonly scene: Phaser.Scene;

  constructor(
    scene: Phaser.Scene,
    shape: AsteroidShape,
    spawnX: number,
    spawnY: number,
    hpMultiplier: number,
    materialsByChunk: ReadonlyMap<string, Material>,
  ) {
    this.scene = scene;

    for (const [k, v] of shape.adjacency) {
      this.adjacency.set(k, new Set(v));
    }

    let sumX = 0;
    let sumY = 0;
    for (const c of shape.cells) {
      sumX += c.x;
      sumY += c.y;
    }
    const avgX = sumX / shape.cells.length;
    const avgY = sumY / shape.cells.length;

    const matterBodies = scene.matter.bodies;
    const parts: MatterJS.BodyType[] = [];
    const partInfos: Array<{
      part: MatterJS.BodyType;
      chunkId: string;
      material: Material;
      isCore: boolean;
      localOffset: { x: number; y: number };
    }> = [];

    for (const [, entries] of shape.chunksByCell) {
      for (const entry of entries) {
        const material = materialsByChunk.get(entry.chunkId);
        if (!material) continue;
        const isCore = entry.chunkId === shape.coreChunkId;
        const localX = (entry.cell.x - avgX) * CHUNK_PIXEL_SIZE;
        const localY = -(entry.cell.y - avgY) * CHUNK_PIXEL_SIZE;
        const worldX = spawnX + localX;
        const worldY = spawnY + localY;

        const part = matterBodies.rectangle(
          worldX, worldY, CHUNK_PIXEL_SIZE, CHUNK_PIXEL_SIZE,
          {
            friction: 0.1, frictionAir: 0.005, restitution: 0,
            mass: 0.25, slop: 0.005,
          },
        );
        parts.push(part);
        partInfos.push({
          part, chunkId: entry.chunkId, material, isCore,
          localOffset: { x: localX, y: localY },
        });
      }
    }

    const body = scene.matter.body.create({
      parts,
      position: { x: spawnX, y: spawnY },
      frictionAir: 0.005,
    });
    this.compoundBody = body;

    (body as unknown as { gravityScale: { x: number; y: number } }).gravityScale = {
      x: 0, y: 0,
    };

    scene.matter.world.add(body);

    for (const info of partInfos) {
      const plugin: ChunkPartPlugin = {
        kind: 'chunk',
        asteroid: this,
        chunkId: info.chunkId,
      };
      (info.part as unknown as { plugin: ChunkPartPlugin }).plugin = plugin;

      const sprite = scene.add.image(0, 0, textureKeyFor(info.material));
      sprite.setDepth(0);

      const maxHp = info.material.tier * hpMultiplier;
      this.chunks.set(info.chunkId, {
        chunkId: info.chunkId,
        material: info.material,
        isCore: info.isCore,
        localOffset: info.localOffset,
        bodyPart: info.part,
        sprite,
        hp: maxHp,
        maxHp,
      });
    }

    this.syncSprites();
  }

  get body(): MatterJS.BodyType { return this.compoundBody; }

  get isAlive(): boolean { return this.chunks.size > 0; }

  applyKinematicFall(velocityY: number): void {
    this.scene.matter.body.setVelocity(this.compoundBody, {
      x: this.compoundBody.velocity.x, y: velocityY,
    });
  }

  syncSprites(): void {
    const pos = this.compoundBody.position;
    const angle = this.compoundBody.angle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (const chunk of this.chunks.values()) {
      const { x: ox, y: oy } = chunk.localOffset;
      chunk.sprite.x = pos.x + (ox * cos - oy * sin);
      chunk.sprite.y = pos.y + (ox * sin + oy * cos);
      chunk.sprite.rotation = angle;
    }
  }

  isOutOfBounds(maxY: number): boolean {
    return this.compoundBody.position.y > maxY;
  }

  destroy(): void {
    this.scene.matter.world.remove(this.compoundBody);
    for (const chunk of this.chunks.values()) {
      chunk.sprite.destroy();
    }
    this.chunks.clear();
    this.adjacency.clear();
  }
}
