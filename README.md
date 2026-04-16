# Asteroid Grinder

An idle physics sandbox. Asteroids fall into a narrow chute where draggable saw weapons chew them into chunks. Collect the debris at the death line, earn cash, buy more weapons, upgrade everything. Watch the physics. Relax.

Phaser 3 + Matter.js + TypeScript + Vite. 1280×720 (16:9) with auto-scaling.

## Status

**Phase 8 — Menu & HUD (MVP), done (2026-04-16).** Options modal (gear button top-right or ESC) with Save Now, Show/Hide Debug Overlay, and Restart Game (confirm dialog). Debug overlay toggles at runtime via backtick (`) and shows FPS, body count, asteroid/chunk totals, cash breakdown, cash/sec EMA rate, and effective weapon params. `window.__GAME__` + `window.__STATE__` are always exposed for devtools poking (no longer gated on `?debug=1`). Manual save writes an instant snapshot and flashes a "Saved" toast. Restart clears `localStorage` and hard-reloads. Shop styling deferred to the art pass. 107 vitest tests.

Previous phases: Phase 7 (save & offline — autosave, welcome-back, EMA rate tracker, per-instance weapon positions); Phase 6.5 (compound-body asteroid rewrite — one Matter body per live connected component, native broadphase pile handling); Phase 6 (asteroid overhaul — 9-tier material ladder, Quality + Fall Speed upgrades); Phase 5 (weapons — Saw, Laser, Missile, Black Hole behind `WeaponBehavior`); Phase 4 (weapon shop + multi-instance); Phase 3 (economy + upgrades); Phase 2 (round asteroids + fracture); Phase 1 (engine spike).

Next up: Phase 9 (code review) → Phase 10 (final verification + remote deploy, MVP ships) → Phase 11 (art & audio pass, post-MVP). See [ROADMAP.md](ROADMAP.md).

## Run locally

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173. Press **`** (backtick) in-game to toggle the stats HUD, or **ESC** / the gear icon for the options menu. `?debug=1` additionally enables Matter's wireframe overlay.

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
