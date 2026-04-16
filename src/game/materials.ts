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
