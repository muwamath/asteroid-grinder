# Asteroid Grinder Roadmap

Living document. Phases are strategic milestones; the todo list at the bottom tracks the next concrete actions for the current phase.

## Phases

1. **Engine spike** — **done (2026-04-15)**. Vite + TypeScript + Phaser 3 + Matter.js scaffold with draggable stopper, orbiting saw blade (dynamic sensor + kinematic orbit), 3×3 loose pinata spawner, red death line, cash HUD, debug mode (`?debug=1` → Matter wireframes + FPS + saw-hit counter). Verified end-to-end in Chrome. Engine choice confirmed viable.
2. **Core loop parity — round asteroids** — **in progress**. Port Asteroid Grinder v2's `CircularShapeGenerator` to TS, replace rectangular pinata spawner with welded-chunk asteroid bodies, per-chunk HP, saw damage routes to a chunk → fracture via connected-components when chunks die. Pure-logic files are in `src/game/` (shape, rng, circularShapeGenerator, connectedComponents, palette). `Asteroid` class with welded-chunk construction + detach-on-death is written but NOT YET wired into `GameScene.ts`. **Next session picks up here.**
3. **Weapons** — pending. Port all four Pinata Grinder weapon types:
   - Saw Blade (physical contact damage)
   - Laser (beam + continuous energy damage)
   - Missile (homing AOE with lead targeting)
   - Black Hole (gravity vortex)
   Each with its own upgrade slots (damage / fire rate / range / blade count etc.).
4. **Stoppers & shop** — pending. Multiple draggable stoppers, per-stopper weapon menu, sell-and-refund, buy-more-stoppers button with escalating cost.
5. **Global upgrades** — pending. Wall size, pinata size, spawner rate, oscillation, pinata HP, death-line damage.
6. **Pinata variants** — pending. Basic / Armored / Shielded / Swift / Heavy with per-variant resistances and reward multipliers.
7. **Save & offline** — pending. `localStorage` autosave every N seconds, welcome-back offline-progression popup.
8. **Menu & HUD polish** — pending. Options menu, manual save, restart, debug overlay, shop styling.
9. **Art & audio pass** — pending. Palette, particle polish, lo-fi loop, chunky SFX.
10. **Code review** — pending. Fresh reviewer agent, findings, fixes. (Required phase per global conventions.)
11. **Final verification & remote deploy** — pending. Full typecheck + build, live validation in Chrome, push to a new GitHub repo, optional GH Pages setup.

## Current todos (Phase 2 — Core loop parity, round asteroids)

- [x] Port `ChunkCell`, `ChunkShape`, `AsteroidShape`, `cellKey`, `canonicalEdge` to `src/game/shape.ts`.
- [x] Port mulberry32 `SeededRng` to `src/game/rng.ts`.
- [x] Port `CircularShapeGenerator` (seed + grow + triangle-adjacency-aware placement) to `src/game/circularShapeGenerator.ts`.
- [x] Port `ConnectedComponents` BFS to `src/game/connectedComponents.ts`.
- [x] `src/game/palette.ts` — party colors.
- [x] `src/game/asteroid.ts` — `Asteroid` class: construct from an `AsteroidShape` + world position, build a Matter.Image per chunk, weld adjacent chunks with two rigid constraints per shared edge, `damageChunkByImage` reduces HP and calls `detachChunk` on death (severs all welds touching the cell).
- [ ] Create a texture preload in `GameScene` for `chunk-square`, `chunk-tri-NE/NW/SE/SW` (procedural shapes).
- [ ] Write `src/game/asteroidSpawner.ts` — timer-based spawner that generates a fresh shape per spawn (random seed, random chunk count ~9–14, random triangle probability, random color).
- [ ] Rewrite `GameScene.ts` to use `AsteroidSpawner` instead of the loose pinata spawner: replace per-frame `blocks` set with `chunkImages` registry, route saw contact to `asteroid.damageChunkByImage`, death-line collection iterates chunks.
- [ ] Verify in Chrome: asteroids fall as cohesive rocks, saw chops chunks off, fractured chunks spin free and get collected.
- [ ] Vitest set up + basic tests for `CircularShapeGenerator` (connected, correct count) and `connectedComponents` (splits work).

## Backlog (future work)

- Additional weapons from `TODO.md` in the Unity project (Tesla Coil, Freeze Ray, Flak Cannon, Gravity Well, Rail Gun, Drone Swarm).
- Prestige / meta loop (no design yet).
- Mobile/portrait mode.
- Achievements, cosmetics.
