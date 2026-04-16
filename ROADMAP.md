# Asteroid Grinder Roadmap

Living document. Phases are strategic milestones; the todo list at the bottom tracks the next concrete actions for the current phase.

## Phases

1. **Engine spike** — **done (2026-04-15)**. Vite + TypeScript + Phaser 3 + Matter.js scaffold with draggable stopper, orbiting saw blade (dynamic sensor + kinematic orbit), 3×3 loose asteroid spawner, red death line, cash HUD, debug mode (`?debug=1` → Matter wireframes + FPS + saw-hit counter). Verified end-to-end in Chrome. Engine choice confirmed viable.
2. **Core loop parity — round asteroids** — **done (2026-04-15)**. Ported `CircularShapeGenerator` + `ConnectedComponents` + `SeededRng` + `AsteroidShape` to TS. `Asteroid` class builds welded-chunk rigid bodies from a shape, damage routes through `damageChunkByImage`, fracture severs weld constraints on kill. `AsteroidSpawner` drops random asteroids (9–14 chunks, random triangle prob, random palette color) into a grind channel flanked by two static walls — verified in Chrome that the channel produces the intended grinding loop (saw chews chunks, dead chunks fall as confetti debris through the death line, cash accrues). Vitest installed, 9 pure-logic tests green. Procedural textures for square + 4 triangle orientations.
3. **Economy & upgrades** — **done (2026-04-15)**. `gameplayState` singleton ledger with `cashChanged` + `upgradeLevelChanged` events. Data-driven `UpgradeCatalog` with 6 upgrades (Saw Damage, Blade Count, Channel Width, Drop Rate, Chunk HP, Asteroid Size), exponential `costAtLevel`. Pure `applyUpgrades(levels) → EffectiveGameplayParams` with vitest coverage. `GameScene` consumes effective params live — subscribes to `upgradeLevelChanged` and rebuilds the multi-blade saw fleet, channel walls, and spawn timer when their dependent params change. Dedicated pure-Phaser `UIScene` running in parallel with `GameScene` renders the side panel with category-striped buttons, level/cost/desc text, affordability tinting, and max-level disabling. 25 vitest tests green. Verified end-to-end in Chrome: earn → buy → gameplay changes → earn more. Code review pass fixed two latent issues (`reset()` listener clobber + unstored collision handler).
4. **Weapon shop & multi-instance weapons** — **done (2026-04-15)**. Weapon-centric shop with left-side weapon bar (Chute, Asteroids categories + Grinder, Saw + 3 locked placeholders). Sub-panels for buy/sell/upgrade. Multiple draggable saw instances — arbor (center disc) + orbiting pinwheel blade, CW/CCW toggle. Grinder is the death line (upgrades only, no arena spawn). Edge-to-edge asteroid chunk connections with paired triangle support, chunkId-based adjacency. 1280×720 16:9 with Scale.FIT. Chunk 12px, arbor r=20, blade r=6. Placeholder economy ($1 flat). 40 vitest tests green. Verified in Chrome.
5. **Weapons** — pending. Port the remaining weapon types beyond Grinder + Saw:
   - Laser (beam + continuous energy damage)
   - Missile (homing AOE with lead targeting)
   - Black Hole (gravity vortex)
   Each with its own upgrade slots and unique arena behavior. Weapon bar UI is already in place from Phase 4 — unlock the locked buttons and wire up behaviors.
6. **Asteroid variants** — pending. Basic / Armored / Shielded / Swift / Heavy with per-variant resistances and reward multipliers.
7. **Save & offline** — pending. `localStorage` autosave every N seconds, welcome-back offline-progression popup.
8. **Menu & HUD polish** — pending. Options menu, manual save, restart, debug overlay, shop styling.
9. **Art & audio pass** — pending. Palette, particle polish, lo-fi loop, chunky SFX.
10. **Code review** — pending. Fresh reviewer agent, findings, fixes. (Required phase per global conventions.)
11. **Final verification & remote deploy** — pending. Full typecheck + build, live validation in Chrome, push to a new GitHub repo, optional GH Pages setup.

## Immediate next

- [x] **Fix physics: chunks pushing through the saw.** — **done (2026-04-16)**. Active barrier enforcement in `update()` pushes alive chunks out of arbor, blade, and channel wall collision zones every frame so pile pressure can never defeat the Matter solver. Dead chunks are excluded so they can still slip through to the death line.
- [x] **Saw upgrade tree expansion.** — **done (2026-04-16)**. Three new upgrades: Spin Speed (tangential impulse pushes chunks), Orbit Speed (base 1 rad/s, was 4), Blade Size (blade radius scales, arbor fixed). 5 total saw upgrades matching Unity prototype tree. 43 vitest tests green.

## Current todos (Phase 5 — Weapons)

- [ ] Design and implement Laser weapon (beam + continuous energy damage)
- [ ] Design and implement Missile weapon (homing AOE with lead targeting)
- [ ] Design and implement Black Hole weapon (gravity vortex)
- [ ] Create `Weapon` interface / base abstraction that Grinder and Saw refactor onto

## Backlog (future work)

- **Economy rebalance.** All costs are placeholder ($1 flat). Needs proper exponential scaling, per-weapon buy cost curves, sell refund formula, and upgrade cost tuning. Must come AFTER all weapons and money-touching features are implemented.
- **Grinder visual overhaul.** Replace the plain circle with spinning saw teeth / conveyor-belt feel. Comes after weapons.
- **Saw direction on double-click.** Replace CW/CCW menu toggle with double-click on the saw arbor to reverse direction. Simpler, more tactile.
- **Saw shape library.** Unlock alternative blade silhouettes (circular, bladed, star, crescent) via a "Shape Library" purchase. Needs `SawShape` concept (sprite + collider profile per shape) and a selector UI.
- Additional weapons beyond the four in Phase 5 (Tesla Coil, Freeze Ray, Flak Cannon, Gravity Well, Rail Gun, Drone Swarm — from the Unity project's `TODO.md`).
- **Background pass.** The arena currently sits on a flat `#1a1a28` canvas. Needs a proper background: stars, nebula gradient, parallax layers, or a subtle animated field. Should read as "space" without distracting from the gameplay. Defer until art pass unless flagged earlier.
- **Prestige / meta loop.** Prestige triggers after collecting enough "cores" (new resource). Resets progress but unlocks random pathways, new zones where weapons can go, and deeper meta-progression. Need to design a compelling reason to prestige (what do you gain that makes resetting feel worth it?).
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
- **General asteroid improvements — including "larger sooner" on the upgrade curve.** The Unity `AsteroidSize` upgrade started at 4 chunks/level 0 and added 2 per level. Desired direction: asteroids should grow MORE and FASTER early in the curve so the game feels meaty quickly. Tune `BaseAsteroidChunkCount` and the per-level multiplier. Consider a non-linear curve (e.g. Fibonacci-like).
- **Chunk containment — stop chunks from flying out of the arena.** Dead chunks from high-velocity saw hits sometimes escape through the top of the arena or over the walls. Options: raise walls, add a ceiling collider at spawn height, clamp chunk velocity on death, or give chunks drag post-death. Diagnose in play first.
- **Paired triangles — two triangles in the same cell.** Unity `CircularShapeGenerator` allowed at most one shape per cell (Square or one of 4 Triangle rotations), so a triangle's hypotenuse never connects to anything. Desired direction: two triangles (e.g. NE + SW halves) share one cell with an internal diagonal split. Requires refactoring `AsteroidShape` from `Dictionary<ChunkCell, ChunkShape>` to a tile-indexed list so multiple chunks can share a cell coordinate. Touches generator, factory, fracture, tests. ~300-line refactor.
- **Wall expansion should be much slower.** Arena Width upgrade widened by 1 unit per level (2 → 10 over 8 levels). Desired direction: progression should feel earned — widen by smaller increments (e.g. 0.25 per level, extend the cap), or scale cost much more aggressively.

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
