# Asteroid Grinder Roadmap

Living document. Phases are strategic milestones; the todo list at the bottom tracks the next concrete actions for the current phase.

## Phases

1. **Engine spike** — **done (2026-04-15)**. Vite + TypeScript + Phaser 3 + Matter.js scaffold with draggable stopper, orbiting saw blade (dynamic sensor + kinematic orbit), 3×3 loose pinata spawner, red death line, cash HUD, debug mode (`?debug=1` → Matter wireframes + FPS + saw-hit counter). Verified end-to-end in Chrome. Engine choice confirmed viable.
2. **Core loop parity — round asteroids** — **done (2026-04-15)**. Ported `CircularShapeGenerator` + `ConnectedComponents` + `SeededRng` + `AsteroidShape` to TS. `Asteroid` class builds welded-chunk rigid bodies from a shape, damage routes through `damageChunkByImage`, fracture severs weld constraints on kill. `AsteroidSpawner` drops random asteroids (9–14 chunks, random triangle prob, random palette color) into a grind channel flanked by two static walls — verified in Chrome that the channel produces the intended grinding loop (saw chews chunks, dead chunks fall as confetti debris through the death line, cash accrues). Vitest installed, 9 pure-logic tests green. Procedural textures for square + 4 triangle orientations.
3. **Economy & upgrades** — **done (2026-04-15)**. `gameplayState` singleton ledger with `cashChanged` + `upgradeLevelChanged` events. Data-driven `UpgradeCatalog` with 6 upgrades (Saw Damage, Blade Count, Channel Width, Drop Rate, Chunk HP, Asteroid Size), exponential `costAtLevel`. Pure `applyUpgrades(levels) → EffectiveGameplayParams` with vitest coverage. `GameScene` consumes effective params live — subscribes to `upgradeLevelChanged` and rebuilds the multi-blade saw fleet, channel walls, and spawn timer when their dependent params change. Dedicated pure-Phaser `UIScene` running in parallel with `GameScene` renders the side panel with category-striped buttons, level/cost/desc text, affordability tinting, and max-level disabling. 25 vitest tests green. Verified end-to-end in Chrome: earn → buy → gameplay changes → earn more. Code review pass fixed two latent issues (`reset()` listener clobber + unstored collision handler).
4. **Stoppers & shop** — pending. Multiple draggable stoppers, per-stopper weapon menu, sell-and-refund, buy-more-stoppers button with escalating cost.
5. **Weapons** — pending (moved from old Phase 3). Port the remaining Pinata Grinder weapon types beyond the saw blade:
   - Laser (beam + continuous energy damage)
   - Missile (homing AOE with lead targeting)
   - Black Hole (gravity vortex)
   Each with its own upgrade slots. Weapon abstraction (`Weapon` interface) lands here; existing saw refactors onto it.
6. **Pinata variants** — pending. Basic / Armored / Shielded / Swift / Heavy with per-variant resistances and reward multipliers.
7. **Save & offline** — pending. `localStorage` autosave every N seconds, welcome-back offline-progression popup.
8. **Menu & HUD polish** — pending. Options menu, manual save, restart, debug overlay, shop styling.
9. **Art & audio pass** — pending. Palette, particle polish, lo-fi loop, chunky SFX.
10. **Code review** — pending. Fresh reviewer agent, findings, fixes. (Required phase per global conventions.)
11. **Final verification & remote deploy** — pending. Full typecheck + build, live validation in Chrome, push to a new GitHub repo, optional GH Pages setup.

## Current todos (Phase 4 — Stoppers & shop)

- [ ] Scope Phase 4 with Matt: how many stoppers max, per-stopper state shape, whether each stopper has its own saw or shares one, shop UI for buying more stoppers.
- [ ] Refactor single `stopper` + single saw fleet into a list of `Stopper` objects, each owning its own orbit angle + blade fleet.
- [ ] Buy-more-stoppers upgrade button with escalating cost (consider integrating into existing `UpgradeCatalog` or a new "shop" data layer).
- [ ] Sell-and-refund per stopper (partial refund of total spend).
- [ ] Per-stopper weapon selector stub (returns saw only until Phase 5 weapons land).

## Backlog (future work)

- Additional weapons beyond the four in Phase 5 (Tesla Coil, Freeze Ray, Flak Cannon, Gravity Well, Rail Gun, Drone Swarm — from the Unity project's `TODO.md`).
- **Background pass.** The arena currently sits on a flat `#1a1a28` canvas. Needs a proper background: stars, nebula gradient, parallax layers, or a subtle animated field. Should read as "space" without distracting from the gameplay. Defer until art pass or earlier if it bothers Matt again.
- Prestige / meta loop (no design yet).
- Mobile/portrait mode.
- Achievements, cosmetics.

---

## 📦 Post-port reference: Unity prototype roadmap (review AFTER Phase 2 ports the game)

The Unity prototype (local-only, not public) shipped through Phase 5 before being abandoned in favor of this Phaser port. Its roadmap is preserved verbatim below as a design reference — **do not merge these items into the phase list until the core loop is ported and running in Phaser**. Some items are already subsumed by the Phaser phase list above; others are genuine future work (tuning notes, paired-triangle refactor, menu polish) worth porting over once the basic game is playable.

**How to use this section:** after Phase 2 is complete and asteroids fall / fracture / grind in Phaser, walk this list top-to-bottom, decide which items apply to the Phaser version, and either fold them into the main phase list or discard. Then delete this section.

### Phases (Unity prototype)

1. **Foundations** — done (2026-04-14). Local WebGL release build → `scripts/deploy.sh` → `gh-pages`. Edit Mode (2/2) + Play Mode (3/3) tests green. Empty arena scene with DropZone walls, Grinder trigger line at the floor, and left panel placeholder.
2. **Chunk & asteroid core** — done (2026-04-14). Chunk entity (square + triangle types in code, square-only generation), connection graph with BFS connected-component tracking, fracture-into-N-rigid-bodies on chunk destruction, time-based spawner dropping asteroids into the arena. 17 EditMode + 12 PlayMode tests green.
3. **Spinning Saw** — done (2026-04-15). Circular hub + orbiting/spinning triangular blade at the pinched waist of a new hourglass DropZone. Blade "chews" chunks via `OnCollisionStay2D` (no knockback), emits throttled yellow spark bursts on contact. AsteroidSpawner tuned to gravityScale 0.3, spawn width narrowed to 4. 24 EditMode + 14 PlayMode tests green.
4. **Economy & Grinder** — done (2026-04-15). Grinder at the floor pays out cash on chunk entry ($1 per live chunk, `max(1, MaxHp × multiplier)` per dead chunk). `GameplayState` singleton ledger with `CashChanged` event. Left-panel screen-space Canvas (TextMeshPro) shows running cash and an interactive "+1 Blade" upgrade button ($10, cap 6). 41 EditMode + 28 PlayMode tests green.
5. **Upgrade trees** — done (2026-04-15). 10-upgrade tree across 3 categories (Saw: Blade Count / Damage / Spin / Orbit / Size; Environment: Grinder DoT / Arena Width; Asteroid: Drop Rate / Chunk HP / Asteroid Size). `UpgradeCatalog` + `UpgradeState` + `UpgradeApplier` pure-C# data model with exponential `CostFormula`. Category drill-down UI. Vertical-walled arena (no more hourglass). Grinder reworked to damage-over-time with velocity-clamp block. `CircularShapeGenerator` produces roughly-round asteroid silhouettes with mixed square/triangle chunks. Random asteroid spin on spawn. Dev starting cash $5000 until debug overlay lands. 75 EditMode + 35 PlayMode tests green.
6. **Save & offline** — not reached in Unity. Autosave, offline progression, welcome-back popup.
7. **Debug overlay** — not reached. Stats, inspector, controls, visual overlays, event log. Includes toggle to zero out starting-cash dev cheat.
8. **Art pass** — not reached. Chunk sprites, particles, palette, background.
9. **Audio pass** — not reached. Lo-fi loop, chunky SFX.

### Unity-era backlog (tuning notes worth keeping)

#### Asteroid & arena tuning
- **General asteroid improvements — including "larger sooner" on the upgrade curve.** The Unity `AsteroidSize` upgrade started at 4 chunks/level 0 and added 2 per level. Matt wants asteroids to grow MORE and FASTER early in the curve so the game feels meaty quickly. Tune `BaseAsteroidChunkCount` and the per-level multiplier. Consider a non-linear curve (e.g. Fibonacci-like).
- **Chunk containment — stop chunks from flying out of the arena.** Dead chunks from high-velocity saw hits sometimes escape through the top of the arena or over the walls. Options: raise walls, add a ceiling collider at spawn height, clamp chunk velocity on death, or give chunks drag post-death. Diagnose in play first.
- **Paired triangles — two triangles in the same cell.** Unity `CircularShapeGenerator` allowed at most one shape per cell (Square or one of 4 Triangle rotations), so a triangle's hypotenuse never connects to anything. Matt wants two triangles (e.g. NE + SW halves) to share one cell with an internal diagonal split. Requires refactoring `AsteroidShape` from `Dictionary<ChunkCell, ChunkShape>` to a tile-indexed list so multiple chunks can share a cell coordinate. Touches generator, factory, fracture, tests. ~300-line refactor.
- **Wall expansion should be much slower.** Arena Width upgrade widened by 1 unit per level (2 → 10 over 8 levels). Matt wants the progression earned — widen by smaller increments (e.g. 0.25 per level, extend the cap), or scale cost much more aggressively.

#### Saw tree
- **Buy and pick saw shape.** Saw is locked to one blade silhouette (triangular). Add a "Shape Library" purchase that unlocks alternatives (circular, bladed, star, crescent) and a selector UI. Needs a new `SawShape` concept (sprite + collider profile per shape) plus a "currently equipped" setter on the saw hub and UI for selection.

#### Menu/UX
- **Visual overhaul of the menu system** — Unity left-panel Canvas was a functional MVP (cash readout + category rail + sub-panel). Needs proper visual design: typography, spacing, panel framing, hover/press feedback, category icon art.
- **Live-demo category icons** — instead of glyph placeholders (★ ■ ●), render each category's hero entity into the button itself (e.g. a miniature spinning saw inside the Saw icon). Defer to art pass.
- **Grinder sprite / visual polish.** Unity grinder was a flat light-blue bar — needs teeth, rotation animation, chew-effect particles, conveyor-belt feel.

#### Polish backlog (art pass)
- Triangle chunks need a more distinctive visual beyond a flat procedural 32×32 right-triangle sprite.
- Spark bursts: swap procedural 1×1 white sprite for a small star/plus glyph, tint warmer toward centre.
- Saw hub + blade: procedural 64×64 sprites look slightly chunky at large zoom — bump to 128 or ship proper sprite assets.
