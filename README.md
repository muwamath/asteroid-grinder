# Asteroid Grinder

An idle physics sandbox. Asteroids fall into a narrow chute where draggable saw weapons chew them into chunks. Collect the debris at the death line, earn cash, buy more weapons, upgrade everything. Watch the physics. Relax.

Phaser 3 + Matter.js + TypeScript + Vite. 1280×720 (16:9) with auto-scaling.

## Status

**Phase 6 — Asteroid Overhaul, done (2026-04-16).** Replaced flat pastel "party colors" with a 9-tier material ladder (Dirt → Stone → Copper → Silver → Gold → Ruby → Emerald → Sapphire → Diamond). HP and reward both scale with tier. Two new upgrades under Asteroids: **Asteroid Quality** (shifts the per-chunk material distribution upward), **Fall Speed** (base drift is very slow; scales up with level). Triangles removed — squares-only chunk system. Centroid chunk tagged `isCore` for the future prestige mechanic. Weld damping + bumped Matter solver iterations reduce pile squish. 77 vitest tests.

Previous phases: Phase 5 (Weapons — Saw, Laser, Missile, Black Hole with `WeaponBehavior` interface); Phase 4 (weapon shop + multi-instance); Phase 3 (economy + upgrades); Phase 2 (round asteroids + fracture); Phase 1 (engine spike).

Next up: compound-body asteroid refactor (eliminate residual weld squish), then Phase 7 (Asteroid Variants or Save/Offline). See [ROADMAP.md](ROADMAP.md).

## Run locally

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173. Append `?debug=1` for the Matter wireframe overlay + stats HUD.

## Scripts

| command | what it does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check then produce `dist/` |
| `npm run preview` | Serve the built `dist/` for smoke testing |
| `npm run typecheck` | `tsc --noEmit` (no bundling) |
| `npm test` | Run the vitest suite once |
| `npm run test:watch` | Vitest in watch mode |

## Docs

- [ROADMAP.md](ROADMAP.md) — phases and current todos
- [CLAUDE.md](CLAUDE.md) — project conventions for Claude Code
