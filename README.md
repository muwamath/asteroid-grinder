# Asteroid Grinder

An idle physics sandbox. Asteroids fall into a narrow chute where draggable saw weapons chew them into chunks. Collect the debris at the death line, earn cash, buy more weapons, upgrade everything. Watch the physics. Relax.

Phaser 3 + Matter.js + TypeScript + Vite. 1280×720 (16:9) with auto-scaling.

## Status

**Phase 4 — weapon shop & multi-instance weapons, done (2026-04-15).** Weapon-centric shop with left-side weapon bar (Chute, Asteroids categories + Grinder, Saw weapons + locked placeholders for Laser, Missile, Black Hole). Sub-panels for buy/sell/upgrade. Multiple draggable weapon instances per type. Saw has arbor (center disc) + orbiting pinwheel blade with CW/CCW toggle. Grinder is the death line (upgrades only, no arena spawn). Edge-to-edge asteroid chunk connections with paired triangle support. 40 vitest tests.

Next up: asteroid creator refinement + Phase 5 weapons. See [ROADMAP.md](ROADMAP.md).

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
