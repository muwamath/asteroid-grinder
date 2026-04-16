import Phaser from 'phaser';
import type { ChunkTarget } from './chunkTarget';
import type { CompoundAsteroid } from './compoundAsteroid';

export interface BlackHoleParams {
  pullRange: number;
  pullForce: number;
  coreSize: number;
  coreDamage: number;
  maxTargets: number;
}

/**
 * Black hole: pulls whole asteroid compound bodies inward, pushes loose
 * dead chunks outward, and damages live chunks inside the core radius.
 */
export class BlackHole {
  update(
    deltaMs: number,
    originX: number,
    originY: number,
    chunks: readonly ChunkTarget[],
    liveAsteroids: readonly CompoundAsteroid[],
    deadChunks: Iterable<Phaser.Physics.Matter.Image>,
    scene: Phaser.Scene,
    params: BlackHoleParams,
  ): void {
    const dt = deltaMs / 1000;
    const range2 = params.pullRange * params.pullRange;
    const core2 = params.coreSize * params.coreSize;
    const matterScene = scene as Phaser.Scene & { matter: Phaser.Physics.Matter.MatterPhysics };

    // Pull live compound asteroids inward (whole-body force, no per-chunk shear).
    for (const ast of liveAsteroids) {
      const body = ast.body;
      const dx = body.position.x - originX;
      const dy = body.position.y - originY;
      const dist2 = dx * dx + dy * dy;
      if (dist2 > range2) continue;
      const dist = Math.max(Math.sqrt(dist2), 1);
      const nx = dx / dist;
      const ny = dy / dist;
      const mag = params.pullForce / dist;
      matterScene.matter.body.applyForce(
        body,
        { x: body.position.x, y: body.position.y },
        { x: -nx * mag, y: -ny * mag },
      );
    }

    // Push dead chunks outward.
    for (const dead of deadChunks) {
      if (!dead.active) continue;
      const dx = dead.x - originX;
      const dy = dead.y - originY;
      const dist2 = dx * dx + dy * dy;
      if (dist2 > range2) continue;
      const dist = Math.max(Math.sqrt(dist2), 1);
      const nx = dx / dist;
      const ny = dy / dist;
      const mag = params.pullForce / dist;
      dead.applyForce(new Phaser.Math.Vector2(nx * mag, ny * mag));
    }

    // Core damage: live targets within core radius take DPS, capped at maxTargets.
    const candidates: Array<{ target: ChunkTarget; dist: number }> = [];
    for (const chunk of chunks) {
      if (chunk.dead) continue;
      const dx = chunk.x - originX;
      const dy = chunk.y - originY;
      const d2 = dx * dx + dy * dy;
      if (d2 > core2) continue;
      candidates.push({ target: chunk, dist: Math.sqrt(d2) });
    }
    candidates.sort((a, b) => a.dist - b.dist);
    const count = Math.min(params.maxTargets, candidates.length);
    for (let i = 0; i < count; i++) {
      candidates[i].target.damage(params.coreDamage * dt);
    }
  }
}
