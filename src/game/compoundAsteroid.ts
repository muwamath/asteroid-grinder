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

let nextAsteroidId = 1;

export class CompoundAsteroid {
  readonly id: string;
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
    this.id = `A${nextAsteroidId++}`;

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

        // Create parts at local (centered around 0,0). Matter.Body.create
        // with `position` below places the compound at spawn and translates
        // parts accordingly. Pre-positioning parts here causes a double-offset
        // bug where the parent body's vertices/bounds end up at 2x the
        // intended position, making broadphase miss all collisions.
        const part = matterBodies.rectangle(
          localX, localY, CHUNK_PIXEL_SIZE, CHUNK_PIXEL_SIZE,
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
      frictionAir: 0.005,
    });
    this.compoundBody = body;

    (body as unknown as { gravityScale: { x: number; y: number } }).gravityScale = {
      x: 0, y: 0,
    };

    // Parts were created at local offsets (centered around 0,0), so the
    // compound's centroid is at origin. Move it to the spawn location.
    scene.matter.body.setPosition(body, { x: spawnX, y: spawnY });

    // Small random spin kick so asteroids visibly tumble as they fall.
    scene.matter.body.setAngularVelocity(body, (Math.random() - 0.5) * 0.01);

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

  /**
   * Apply kinematic fall velocity — but not if the asteroid is sleeping
   * (pile stable) or currently resting on another body (Matter has already
   * stopped its fall; re-injecting velocity would drive it into the pile
   * and create unresolvable penetration). `enableSleeping: true` on the
   * engine lets stacked bodies freeze; this check keeps them settled.
   */
  applyKinematicFall(velocityY: number): void {
    if (this.compoundBody.isSleeping) return;

    const pairs = (this.scene.matter.world as unknown as {
      engine: { pairs: { list: Array<{
        isActive: boolean;
        bodyA: { parent?: unknown };
        bodyB: { parent?: unknown };
        collision: { normal: { y: number } };
      }> } };
    }).engine.pairs.list;

    for (const p of pairs) {
      if (!p.isActive) continue;
      const aMine = p.bodyA.parent === this.compoundBody;
      const bMine = p.bodyB.parent === this.compoundBody;
      if (!aMine && !bMine) continue;
      // normal points bodyA → bodyB. normal.y > 0 means B is below A.
      const restingNy = aMine ? p.collision.normal.y : -p.collision.normal.y;
      if (restingNy > 0.5) return; // resting on something below — let Matter hold us
    }

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

  /**
   * Kinematic wall safety net. Finds the worst x-axis penetration of any
   * chunk part past the channel inner faces and shoves the whole compound
   * body back by that amount. Zeroes the outward x velocity if pushing
   * against a wall, so the pile doesn't keep pressing outward next tick.
   */
  enforceWalls(wallInnerL: number, wallInnerR: number): void {
    const half = CHUNK_PIXEL_SIZE / 2;
    let worstLeft = 0;  // positive = chunk pokes past left wall
    let worstRight = 0; // positive = chunk pokes past right wall
    for (const chunk of this.chunks.values()) {
      const px = chunk.bodyPart.position.x;
      const leftPen = wallInnerL - (px - half);
      if (leftPen > worstLeft) worstLeft = leftPen;
      const rightPen = (px + half) - wallInnerR;
      if (rightPen > worstRight) worstRight = rightPen;
    }
    if (worstLeft <= 0 && worstRight <= 0) return;

    const body = this.compoundBody;
    const dx = worstLeft > worstRight ? worstLeft : -worstRight;
    if (dx === 0) return;

    this.scene.matter.body.setPosition(body, {
      x: body.position.x + dx, y: body.position.y,
    });
    // Zero the outward x component so the pile doesn't keep pressing.
    const outward = dx > 0 ? body.velocity.x < 0 : body.velocity.x > 0;
    if (outward) {
      this.scene.matter.body.setVelocity(body, { x: 0, y: body.velocity.y });
    }
  }

  damageChunk(chunkId: string, amount: number): { killed: boolean; hp: number } {
    const chunk = this.chunks.get(chunkId);
    if (!chunk) return { killed: false, hp: 0 };
    chunk.hp -= amount;
    if (chunk.hp <= 0) return { killed: true, hp: 0 };
    return { killed: false, hp: chunk.hp };
  }

  extractDeadChunk(chunkId: string): {
    worldX: number; worldY: number;
    velocityX: number; velocityY: number;
    material: Material;
    textureKey: string;
    isCore: boolean;
  } | null {
    const chunk = this.chunks.get(chunkId);
    if (!chunk) return null;

    const body = this.compoundBody;
    const angle = body.angle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const ox = chunk.localOffset.x;
    const oy = chunk.localOffset.y;
    const worldX = body.position.x + (ox * cos - oy * sin);
    const worldY = body.position.y + (ox * sin + oy * cos);

    const w = body.angularVelocity;
    const tvx = -w * (ox * sin + oy * cos);
    const tvy =  w * (ox * cos - oy * sin);
    const velocityX = body.velocity.x + tvx;
    const velocityY = body.velocity.y + tvy;

    const remainingParts: MatterJS.BodyType[] = [];
    for (const c of this.chunks.values()) {
      if (c.chunkId !== chunkId) remainingParts.push(c.bodyPart);
    }
    if (remainingParts.length > 0) {
      this.scene.matter.body.setParts(this.compoundBody, remainingParts, false);
    }

    chunk.sprite.destroy();
    this.chunks.delete(chunkId);

    return {
      worldX, worldY, velocityX, velocityY,
      material: chunk.material,
      textureKey: textureKeyFor(chunk.material),
      isCore: chunk.isCore,
    };
  }

  setAdjacency(adjacency: Map<string, Set<string>>): void {
    this.adjacency.clear();
    for (const [k, v] of adjacency) this.adjacency.set(k, new Set(v));
  }

  split(components: readonly string[][]): CompoundAsteroid[] {
    if (components.length < 2) {
      throw new Error('split() requires at least 2 components');
    }

    const parent = this.compoundBody;
    const px = parent.position.x;
    const py = parent.position.y;
    const pAngle = parent.angle;
    const pVx = parent.velocity.x;
    const pVy = parent.velocity.y;
    const pW = parent.angularVelocity;

    const results: CompoundAsteroid[] = [];

    for (const component of components) {
      let cox = 0;
      let coy = 0;
      for (const id of component) {
        const chunk = this.chunks.get(id);
        if (!chunk) throw new Error(`split: missing chunk ${id}`);
        cox += chunk.localOffset.x;
        coy += chunk.localOffset.y;
      }
      cox /= component.length;
      coy /= component.length;

      const cos = Math.cos(pAngle);
      const sin = Math.sin(pAngle);
      const newCenterX = px + (cox * cos - coy * sin);
      const newCenterY = py + (cox * sin + coy * cos);

      const tvx = -pW * (cox * sin + coy * cos);
      const tvy =  pW * (cox * cos - coy * sin);
      const newVx = pVx + tvx;
      const newVy = pVy + tvy;

      const child = CompoundAsteroid.fromPartsOfParent({
        scene: this.scene,
        parent: this,
        component,
        newCenter: { x: newCenterX, y: newCenterY },
        parentAngle: pAngle,
        parentCentroidOffset: { x: cox, y: coy },
        velocity: { x: newVx, y: newVy },
        angularVelocity: pW,
      });
      results.push(child);
    }

    this.scene.matter.world.remove(this.compoundBody);
    this.chunks.clear();
    this.adjacency.clear();

    return results;
  }

  private static fromPartsOfParent(args: {
    scene: Phaser.Scene;
    parent: CompoundAsteroid;
    component: readonly string[];
    newCenter: { x: number; y: number };
    parentAngle: number;
    parentCentroidOffset: { x: number; y: number };
    velocity: { x: number; y: number };
    angularVelocity: number;
  }): CompoundAsteroid {
    const child = Object.create(CompoundAsteroid.prototype) as CompoundAsteroid;
    (child as unknown as { scene: Phaser.Scene }).scene = args.scene;
    (child as unknown as { id: string }).id = `A${nextAsteroidId++}`;
    (child as unknown as { chunks: Map<string, ChunkPart> }).chunks = new Map();
    (child as unknown as { adjacency: Map<string, Set<string>> }).adjacency = new Map();

    const matterBodies = args.scene.matter.bodies;
    const newParts: MatterJS.BodyType[] = [];
    const componentSet = new Set(args.component);

    for (const id of args.component) {
      const parentChunk = args.parent.chunks.get(id);
      if (!parentChunk) throw new Error(`fromPartsOfParent: missing ${id}`);
      const localX = parentChunk.localOffset.x - args.parentCentroidOffset.x;
      const localY = parentChunk.localOffset.y - args.parentCentroidOffset.y;

      // Parts created at local (0,0)-centered offsets; Body.create + setAngle
      // below places the compound at newCenter with the parent's angle.
      // See main constructor for why pre-positioning parts is wrong.
      const part = matterBodies.rectangle(
        localX, localY, CHUNK_PIXEL_SIZE, CHUNK_PIXEL_SIZE,
        {
          friction: 0.1, frictionAir: 0.005, restitution: 0,
          mass: 0.25, slop: 0.005,
        },
      );
      newParts.push(part);

      const plugin: ChunkPartPlugin = { kind: 'chunk', asteroid: child, chunkId: id };
      (part as unknown as { plugin: ChunkPartPlugin }).plugin = plugin;

      child.chunks.set(id, {
        chunkId: id,
        material: parentChunk.material,
        isCore: parentChunk.isCore,
        localOffset: { x: localX, y: localY },
        bodyPart: part,
        sprite: parentChunk.sprite,
        hp: parentChunk.hp,
        maxHp: parentChunk.maxHp,
      });

      const parentNeighbors = args.parent.adjacency.get(id);
      if (parentNeighbors) {
        const kept = new Set<string>();
        for (const n of parentNeighbors) {
          if (componentSet.has(n)) kept.add(n);
        }
        child.adjacency.set(id, kept);
      }
    }

    const body = args.scene.matter.body.create({
      parts: newParts,
      frictionAir: 0.005,
    });
    (body as unknown as { gravityScale: { x: number; y: number } }).gravityScale = {
      x: 0, y: 0,
    };
    args.scene.matter.body.setPosition(body, args.newCenter);
    args.scene.matter.body.setAngle(body, args.parentAngle);
    args.scene.matter.body.setVelocity(body, args.velocity);
    args.scene.matter.body.setAngularVelocity(body, args.angularVelocity);
    args.scene.matter.world.add(body);
    (child as unknown as { compoundBody: MatterJS.BodyType }).compoundBody = body;

    child.syncSprites();
    return child;
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
