# Asteroid Grinder

An idle physics sandbox. Asteroids fall into a narrow chute where draggable saw weapons chew them into chunks. Collect the debris at the death line, earn cash, buy more weapons, upgrade everything. Watch the physics. Relax.

Phaser 3 + Matter.js + TypeScript + Vite. 2560×1440 (16:9) with auto-scaling and fullscreen (F key or options menu).

## Status

**Prestige shipped (2026-04-17).** Post-MVP, added the meta-loop from ROADMAP §3. Kill vault cores (10× HP; visibly tough) to earn 🔮 Shards; Prestige confirms the trade (bank Shards, wipe the run) and opens an 11-entry persistent shop: 4 free-weapon slots, global cash/damage multipliers, upgrade discount, Refinement (richer asteroid composition), offline-cap extender (8h → 48h), Shard yield, starting cash. Spending runs through a minimal Run Config screen (seed input + re-roll + Start) for reproducible runs. Material distribution is now a two-bucket model — fixed filler (t1 Dirt) + tiered Gaussian (t2–t9) that shifts with Asteroid Quality. Save state bumped v1 → v2 with transparent migration. 169 vitest tests green; 2 Playwright smokes (golden path + vault-kill shard accrual).

**Phase 10 — MVP shipped (2026-04-16).** Full `tsc --noEmit` + `vite build` clean, 122 vitest tests green, production `dist/` validated live in Chrome (asteroid grinding loop, cash accrual, save/load roundtrip across reload, zero console errors). Now includes a proper `GrinderBehavior` — a row of counter-rotating rectangular blades at the channel bottom that chews live chunks for a flat $1 while weapon kills preserve their tier-scaled reward.

Previous phases: Phase 9 (code review — arbor texture guard + save-state numeric validation); Phase 8 (menu & HUD — options modal, debug overlay, restart); Phase 7 (save & offline — autosave, welcome-back, EMA rate tracker); Phase 6.5 (compound-body asteroid rewrite — one Matter body per live connected component); Phase 6 (asteroid overhaul — 9-tier material ladder, Quality + Fall Speed upgrades); Phase 5 (weapons — Saw, Laser, Missile, Black Hole behind `WeaponBehavior`); Phase 4 (weapon shop + multi-instance); Phase 3 (economy + upgrades); Phase 2 (round asteroids + fracture); Phase 1 (engine spike).

Post-MVP backlog (prestige, more weapons, art & audio pass, economy rebalance, etc.) is ranked by impact in [ROADMAP.md](ROADMAP.md).

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
