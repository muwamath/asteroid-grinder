import Phaser from 'phaser';
import type { Asteroid } from './asteroid';

export interface BlackHoleParams {
  pullRange: number;      // px — gravity field radius
  pullForce: number;      // Matter.js force units (very small)
  coreSize: number;       // px — inner damage zone radius
  coreDamage: number;     // DPS within core
  maxTargets: number;     // max chunks affected per frame
}

export class BlackHole {
  /**
   * Run once per frame. Applies gravity to chunks in range and deals
   * core damage. Live chunks are pulled in, dead chunks are pushed out.
   */
  update(
    deltaMs: number,
    originX: number,
    originY: number,
    chunks: Set<Phaser.Physics.Matter.Image>,
    params: BlackHoleParams,
  ): void {
    const dt = deltaMs / 1000;
    const range2 = params.pullRange * params.pullRange;
    const core2 = params.coreSize * params.coreSize;

    // Collect chunks in range, sorted by distance.
    const candidates: Array<{ chunk: Phaser.Physics.Matter.Image; dist: number }> = [];

    for (const chunk of chunks) {
      if (!chunk.active) continue;
      const dx = chunk.x - originX;
      const dy = chunk.y - originY;
      const dist2 = dx * dx + dy * dy;
      if (dist2 > range2) continue;

      const dist = Math.sqrt(dist2);
      candidates.push({ chunk, dist });
    }

    // Sort by distance (closest first), cap at maxTargets.
    candidates.sort((a, b) => a.dist - b.dist);
    const count = Math.min(params.maxTargets, candidates.length);

    for (let i = 0; i < count; i++) {
      const { chunk, dist } = candidates[i];
      const dx = chunk.x - originX;
      const dy = chunk.y - originY;
      const distClamped = Math.max(dist, 1);
      const dead = chunk.getData('dead') as boolean;

      // Inverse-distance force: closer = stronger.
      const forceMag = params.pullForce / distClamped;

      // Direction: toward center for live, away for dead.
      const nx = dx / distClamped;
      const ny = dy / distClamped;
      const sign = dead ? 1 : -1; // -1 = pull inward, +1 = push outward
      chunk.applyForce(new Phaser.Math.Vector2(nx * forceMag * sign, ny * forceMag * sign));

      // Core damage: continuous DPS to alive chunks within core radius.
      if (!dead && dist * dist <= core2) {
        const asteroid = chunk.getData('asteroid') as Asteroid | undefined;
        if (asteroid) {
          asteroid.damageChunkByImage(chunk, params.coreDamage * dt);
        }
      }
    }
  }
}
