# Asteroid Grinder

An idle physics sandbox. Roughly-round asteroids fall into a narrow grind channel where an orbiting saw blade chews them into chunks. Collect the debris, earn cash, upgrade everything. Watch the physics. Relax.

Phaser 3 + Matter.js + TypeScript + Vite. Port of an earlier Unity prototype to a web-native stack.

## Status

**Phase 3 — economy & upgrades, done (2026-04-15).** Data-driven upgrade catalog (Saw Damage, Blade Count, Channel Width, Drop Rate, Chunk HP, Asteroid Size) with an exponential cost formula and a pure applier that turns levels into effective gameplay params. Side-panel upgrade UI runs as a dedicated parallel `UIScene` built in pure Phaser. Buying an upgrade live-rebuilds the affected physical bodies — multi-blade saw fleets around the stopper, movable channel walls, variable spawn timer. 25 vitest tests cover the pure logic.

Phase 4 — stoppers & shop — is next. See [ROADMAP.md](ROADMAP.md).

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
