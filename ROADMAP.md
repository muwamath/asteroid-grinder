# Asteroid Grinder Roadmap

Living document. MVP shipped **2026-04-16** — core loop, 9-tier material ladder, 4 weapons behind `WeaponBehavior`, compound-body asteroids, save/offline, options menu, GH Pages deploy. Phases 1–10 complete; see git history for details.

Backlog below is grouped by **what it adds to the game**. Order is execution order: hygiene + QoL first (lock down the foundation before piling on), then the value-adds.

---

## 1. Tech hygiene — done (2026-04-16)

Shipped on `feature/tech-hygiene`, FF-merged to main.

- ✅ `DESIGN_INVARIANTS.md` at repo root, referenced from `CLAUDE.md`. Load-bearing behaviors documented.
- ✅ Playwright golden-path smoke in `tests/e2e/smoke.spec.ts` — boots game, waits 30s (L0 Fall Speed gives ~40s arena crossing), asserts spawned asteroids, non-zero saw hits, rotating live bodies, clean console. `npm run test:e2e`.
- ✅ Multi-saw collision routing — blades carry their arbor's `instanceId`; `GameScene.handleContact` routes to the owning instance instead of the first weapon with `handleCompoundHit`.
- ✅ Saw cooldown scoped per-asteroid — `lastHitAt` keyed `${asteroid.id}/${chunkId}`, pruned every 1s, entries older than 1s dropped.
- ✅ Zero-chunk asteroid de-listed + destroyed in `damageLiveChunk`'s 0-component branch rather than waiting for the next tick's `isAlive` guard.

**Deferred:** CI action versions (`actions/*@v4/v5` → Node 20 deprecated June 2026). Bump when replacements ship.

## 2. Quality of life

Smaller player-facing wins. Land before content so resolution/layout changes don't invalidate later art work.

- ✅ **Text crispness on HiDPI displays.** Shipped 2026-04-16. Bumped base canvas to 2560×1440 (1:1 on retina) and swept all UI/arena/weapon layout constants; added fullscreen toggle (F key + options menu). Font sizes, panel sizes, death line, channel top, weapon radii all doubled. `channelHalfWidth` + gravity left untouched by explicit call — channel reads narrower and chunks fall slightly slower, tolerated for now.
- **Chunk containment.** Intentional — flying chunks from high-velocity saw hits stay in the game. (Confirmed 2026-04-16: not a bug, won't fix.)
- ✅ **Saw direction on double-click.** Shipped 2026-04-16. Each saw owns its direction (per-instance, no global setting); double-click the arbor to reverse THIS saw. Drag-distance threshold raised to 6px so click jitter no longer eats the toggle. CW/CCW menu buttons removed. Save/load round-trips per-saw direction.
- **Mobile / portrait mode.** Currently desktop-landscape only.

## 3. New gameplay systems

Biggest adds — new reasons to keep playing.

- **Prestige / meta loop — asteroid cores.** Each asteroid has a core chunk (centroid, already tagged `isCore` in Phase 6). Mining cores yields a prestige resource; prestige resets run progress and unlocks random pathways, new zones where weapons can go, and persistent global upgrades. Design question: what makes resetting feel worth it?
  - **Offline-earnings cap extender.** Prestige-tier upgrade that raises `OFFLINE_CAP_MS` (default 8h → 12h → 24h → 48h) at steep prestige cost.
- **More weapons.** Tesla Coil, Freeze Ray, Flak Cannon, Gravity Well, Rail Gun, Drone Swarm (from the Unity prototype backlog). One `WeaponBehavior` file + catalog entry each.
- **Saw shape library.** Purchase unlocks alternate blade silhouettes (circular, bladed, star, crescent). Needs a `SawShape` concept (sprite + collider profile per shape) plus a selector UI.
- **Grinder overhaul.** Currently the grinder is a plain red death line — any chunk crossing it dies for cash. Full rebuild:
  - **Creation** — model the grinder as a proper entity at the death line position, not a hardcoded `DEATH_LINE_Y` constant + ad-hoc chunk-below-Y check. Same `WeaponBehavior` pattern as saws/laser.
  - **Upgrades** — ties into the existing `grinder` weapon type in the catalog. Needs real per-level upgrades (damage, throughput, teeth count, chew speed, width).
  - **Visuals** — teeth, rotation animation, conveyor-belt feel, chew particles. Subsumes the §5 "Grinder visual overhaul" bullet.

## 4. Economy & balance

Makes progression feel earned.

- **Economy rebalance.** All costs are placeholder ($1 flat). Needs exponential scaling, per-weapon buy curves, sell refund formula, upgrade cost tuning. Must land before/with any of the new gameplay systems above.
- **Sell the last weapon; link buy prices.** Allow selling down to zero. All weapon buy prices are linked globally — the Nth weapon of any type costs the same, not per-type. Roll into the rebalance.
- **"Larger sooner" asteroid curve.** Current Asteroid Size upgrade starts at 4 chunks and adds linearly. Desired: grow more, faster early (non-linear, Fibonacci-ish) so the game feels meaty quickly.
- **Slower wall expansion.** Channel Width upgrade should widen by smaller increments or scale cost more aggressively — progression should feel earned.

## 5. Art & audio pass

Visual and sonic polish.

- Palette tuning, particle polish, general readability pass.
- Shop-panel styling: typography, spacing, framing, hover/press feedback, category icon art.
- **Live-demo category icons** — render each category's hero entity into the button (e.g. a miniature spinning saw inside the Saw icon).
- **Background pass.** Flat `#1a1a28` → stars / nebula gradient / parallax / subtle animated field. Should read as "space" without distracting.
- Spark-burst upgrade: swap the procedural 1×1 white for a star/plus glyph, warmer toward centre.
- Saw hub + blade sprites: bump procedural 64×64 art or ship proper assets.
- **Lo-fi audio loop + chunky SFX.** New domain — no audio exists yet.

## 6. Scope expansions

Maybe-later.

- Achievements, cosmetics.
