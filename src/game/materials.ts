import type { SeededRng } from './rng';

export type MaterialBand = 'earth' | 'metal' | 'gem';

export interface Material {
  readonly tier: number;
  readonly name: string;
  readonly band: MaterialBand;
  readonly fillColors: readonly [string, string, string];
  readonly borderColor: string;
  readonly hasGlow: boolean;
  readonly glowColor: string;
}

export const MATERIALS: readonly Material[] = [
  {
    tier: 1, name: 'dirt', band: 'earth',
    fillColors: ['#6b4a2f', '#5a3d27', '#4a3320'],
    borderColor: '#2a1a0d',
    hasGlow: false, glowColor: '#000000',
  },
  {
    tier: 2, name: 'stone', band: 'earth',
    fillColors: ['#9a9a9a', '#808080', '#6a6a6a'],
    borderColor: '#2a2a2a',
    hasGlow: false, glowColor: '#000000',
  },
  {
    tier: 3, name: 'copper', band: 'metal',
    fillColors: ['#ffb88a', '#c86a38', '#8a3a18'],
    borderColor: '#4a2010',
    hasGlow: false, glowColor: '#000000',
  },
  {
    tier: 4, name: 'silver', band: 'metal',
    fillColors: ['#ffffff', '#b8b8c0', '#6a6a78'],
    borderColor: '#3a3a46',
    hasGlow: false, glowColor: '#000000',
  },
  {
    tier: 5, name: 'gold', band: 'metal',
    fillColors: ['#fff4a0', '#ffc53a', '#a8781a'],
    borderColor: '#5a3a0a',
    hasGlow: false, glowColor: '#000000',
  },
  {
    tier: 6, name: 'ruby', band: 'gem',
    fillColors: ['#ffaab8', '#ff2a4a', '#7a0010'],
    borderColor: '#4a0010',
    hasGlow: true, glowColor: 'rgba(255, 80, 100, 0.7)',
  },
  {
    tier: 7, name: 'emerald', band: 'gem',
    fillColors: ['#a8ffc8', '#18c86a', '#064a1a'],
    borderColor: '#004020',
    hasGlow: true, glowColor: 'rgba(60, 220, 130, 0.7)',
  },
  {
    tier: 8, name: 'sapphire', band: 'gem',
    fillColors: ['#a8c8ff', '#2a5aff', '#061a6a'],
    borderColor: '#00104a',
    hasGlow: true, glowColor: 'rgba(80, 140, 255, 0.7)',
  },
  {
    tier: 9, name: 'diamond', band: 'gem',
    fillColors: ['#ffffff', '#d0e8ff', '#7aa8d0'],
    borderColor: '#4a7090',
    hasGlow: true, glowColor: 'rgba(220, 240, 255, 0.9)',
  },
];

export function materialByTier(tier: number): Material | undefined {
  return MATERIALS.find((m) => m.tier === tier);
}

export function materialByName(name: string): Material | undefined {
  return MATERIALS.find((m) => m.name === name);
}

export function textureKeyFor(material: Material): string {
  return `chunk-${material.name}`;
}

const DECAY = 0.7;
const MAX_QUALITY = 8;

export function materialDistribution(qualityLevel: number): number[] {
  const q = Math.max(0, Math.min(MAX_QUALITY, Math.floor(qualityLevel)));
  const maxTier = 1 + q;
  const weights: number[] = [];
  let sum = 0;
  for (let t = 1; t <= 9; t++) {
    const w = t <= maxTier ? Math.pow(DECAY, t - 1) : 0;
    weights.push(w);
    sum += w;
  }
  return weights.map((w) => w / sum);
}

export function chooseMaterial(qualityLevel: number, rng: SeededRng): Material {
  const dist = materialDistribution(qualityLevel);
  let roll = rng.next();
  for (let i = 0; i < dist.length; i++) {
    roll -= dist[i];
    if (roll <= 0) return MATERIALS[i];
  }
  return MATERIALS[MATERIALS.length - 1];
}

// Two-bucket material model (spec §1): filler (t1 Dirt) vs tiered (t2-t9).
// sampleTieredMaterial draws from a truncated-normal distribution whose mean
// shifts right with the in-run Asteroid Quality upgrade level.
//   μ(L) = clamp(2 + 0.6L, 2, 9)
//   σ(L) = clamp(0.6 + 0.08L, 0.5, 1.5)

export function tieredMean(qualityLevel: number): number {
  return Math.max(2, Math.min(9, 2 + qualityLevel * 0.6));
}

export function tieredSigma(qualityLevel: number): number {
  return Math.max(0.5, Math.min(1.5, 0.6 + qualityLevel * 0.08));
}

function boxMuller(rng: SeededRng): number {
  let u1 = rng.next();
  if (u1 < 1e-9) u1 = 1e-9;
  const u2 = rng.next();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function sampleTieredMaterial(qualityLevel: number, rng: SeededRng): Material {
  const mu = tieredMean(qualityLevel);
  const sigma = tieredSigma(qualityLevel);
  const x = mu + sigma * boxMuller(rng);
  const tier = Math.max(2, Math.min(9, Math.round(x)));
  const mat = materialByTier(tier);
  if (!mat) throw new Error(`sampleTieredMaterial: no material for tier ${tier}`);
  return mat;
}

// Real gravity: fallSpeedMultiplier is the per-body gravityScale.y applied
// to alive compound asteroids. 1.0 = full Matter world gravity, so the L0
// baseline of 0.3 is sub-gravity (floaty entry) and L9 = 3.0 is ~3× g.
// Asteroids accelerate naturally from spawn and can build momentum against
// the grinder/saw. Dead chunks use the default gravityScale = 1.0.
const FALL_BASE = 0.3;
const FALL_PER_LEVEL = 0.3;

export function fallSpeedMultiplier(level: number): number {
  return FALL_BASE + Math.max(0, level) * FALL_PER_LEVEL;
}
