# Asteroid Grinder

An idle physics sandbox. Roughly-round asteroids fall into a narrow grind channel where an orbiting saw blade chews them into chunks. Collect the debris, earn cash, upgrade everything. Watch the physics. Relax.

Phaser 3 + Matter.js + TypeScript + Vite. Port of an earlier Unity prototype ([`/Users/matt/dev/Unity/Pinata Grinder`](../../Unity/Pinata%20Grinder)) to a web-native stack.

## Status

**Phase 2 — core loop parity, done (2026-04-15).** Asteroids are welded-chunk rigid bodies built from a deterministic circular shape generator; the saw routes damage to individual chunks and fractures them via connected-components when their HP hits zero. Two static channel walls flank the stopper/saw, producing the intended grinding loop (dead chunks slough off as confetti, fall past the death line, pay out). Debug overlay at `?debug=1` shows FPS, body count, saw hits, kills, and a cash breakdown.

Phase 3 — economy & upgrades — is next. See [ROADMAP.md](ROADMAP.md).

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
