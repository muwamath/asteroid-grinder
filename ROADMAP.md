# Asteroid Grinder Roadmap

Living document. MVP shipped **2026-04-16** — core loop, 9-tier material ladder, 4 weapons behind `WeaponBehavior`, compound-body asteroids, save/offline, options menu, GH Pages deploy. Phases 1–10 complete; see git history for details.

Backlog below is grouped by **what it adds to the game**. Order is execution order: hygiene + QoL first (lock down the foundation before piling on), then the value-adds.

---

## 1. Tech hygiene

Doesn't add on its own — prevents regressions and future pain. Land first so the bigger adds don't compound existing rot.

- **Design invariants + golden-path Playwright smoke.** Short `DESIGN_INVARIANTS.md` listing load-bearing behaviors (asteroids rotate on spawn, saw is slow, grinder chews bottom-up, gem halos, etc.), referenced from `CLAUDE.md`. One Playwright test that boots the game, waits 10s, asserts non-zero rotation / non-zero saw hits / no console errors. Tripwire against refactor drift.
- **Multi-saw collision routing.** `GameScene.handleContact` routes blade-vs-chunk to the FIRST weapon instance with `handleCompoundHit`, regardless of which instance owns the blade. Harmless with one saw; wrong cooldowns/stats with ≥2. Fix: match `otherBody.gameObject.getData('instanceId')` against `inst.id` before routing.
- **Zombie asteroid cleanup.** In `GameScene.damageLiveChunk`, when `components.length === 0`, removal waits for the next `update()` tick's `!ast.isAlive` guard — brief zombie iterated once more. Fix: remove from `liveAsteroids` explicitly in the 0-component branch.
- **Saw `lastHitAt` unbounded growth.** `Map<chunkId, number>` never prunes; few-KB leak per session. Fix: key on `${asteroid.id}/${chunkId}` and drop entries older than ~1s each frame.
- **CI action versions.** `actions/*@v4/v5` run on Node 20 (deprecated June 2026). Bump when replacements ship.

## 2. Quality of life

Smaller player-facing wins. Land before content so resolution/layout changes don't invalidate later art work.

- **Text crispness on HiDPI displays.** `Scale.FIT` upscales the 1280×720 canvas without re-rasterizing text — retina screens see grainy `$cash` and welcome-back text. Cheapest: `crispText()` helper setting `resolution: window.devicePixelRatio` on every Text object. Medium: bump base to 2560×1440. Biggest: switch to `Scale.RESIZE` with proportional layout.
- **Chunk containment.** Dead chunks from high-velocity saw hits can escape the top of the arena. Options: raise walls, add a ceiling collider, clamp chunk velocity on death, or add drag post-death. Diagnose in play first.
- **Saw direction on double-click.** Replace the CW/CCW menu toggle with double-click on the arbor to reverse. Tactile.
- **Mobile / portrait mode.** Currently desktop-landscape only.

## 3. New gameplay systems

Biggest adds — new reasons to keep playing.

- **Prestige / meta loop — asteroid cores.** Each asteroid has a core chunk (centroid, already tagged `isCore` in Phase 6). Mining cores yields a prestige resource; prestige resets run progress and unlocks random pathways, new zones where weapons can go, and persistent global upgrades. Design question: what makes resetting feel worth it?
  - **Offline-earnings cap extender.** Prestige-tier upgrade that raises `OFFLINE_CAP_MS` (default 8h → 12h → 24h → 48h) at steep prestige cost.
- **More weapons.** Tesla Coil, Freeze Ray, Flak Cannon, Gravity Well, Rail Gun, Drone Swarm (from the Unity prototype backlog). One `WeaponBehavior` file + catalog entry each.
- **Saw shape library.** Purchase unlocks alternate blade silhouettes (circular, bladed, star, crescent). Needs a `SawShape` concept (sprite + collider profile per shape) plus a selector UI.

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
- **Grinder visual overhaul.** Replace the plain death line with teeth, rotation animation, conveyor-belt feel, chew-effect particles.
- **Background pass.** Flat `#1a1a28` → stars / nebula gradient / parallax / subtle animated field. Should read as "space" without distracting.
- Spark-burst upgrade: swap the procedural 1×1 white for a star/plus glyph, warmer toward centre.
- Saw hub + blade sprites: bump procedural 64×64 art or ship proper assets.
- **Lo-fi audio loop + chunky SFX.** New domain — no audio exists yet.

## 6. Scope expansions

Maybe-later.

- Achievements, cosmetics.
