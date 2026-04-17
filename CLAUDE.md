# Asteroid Grinder — project conventions for Claude Code

This file is read automatically by Claude Code at session start. It documents project-specific conventions and workflow expectations. Overlay on top of the global `~/.claude/CLAUDE.md`, not a duplicate.

## Engine and stack

- **Phaser 3** (Matter.js physics) + **TypeScript** + **Vite**.
- Dev server: `npm run dev` → http://127.0.0.1:5173.
- Target platform: desktop + mobile web browsers. No native packaging, no WebGL-engine gymnastics.
- Node 22+ / npm 10+ assumed.

## Commands

```bash
npm run dev         # vite dev server @ http://127.0.0.1:5173
npm run build       # tsc --noEmit + vite build
npm run typecheck   # tsc --noEmit (fast)
npm test            # vitest run (pure-logic tests)
npm run test:watch  # vitest in watch mode
```

## Layout

```
asteroid-grinder/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── main.ts                          # Phaser.Game bootstrap
│   ├── scenes/
│   │   ├── GameScene.ts                 # arena, weapon instances, physics, collisions
│   │   └── UIScene.ts                   # weapon bar, sub-panels, upgrade buttons
│   └── game/
│       ├── weaponCatalog.ts             # weapon type + category registry (replaces UPGRADE_CATALOG)
│       ├── weapons/                     # WeaponBehavior interface + per-weapon behaviors
│       │   ├── weaponBehavior.ts        # interface — one file per weapon
│       │   ├── sawBehavior.ts
│       │   ├── grinderBehavior.ts      # row of counter-rotating blades; singleton
│       │   ├── laserBehavior.ts
│       │   ├── missileBehavior.ts
│       │   └── blackholeBehavior.ts
│       ├── collisionCategories.ts      # Matter category bits for dead-chunk passthrough
│       ├── upgradeCatalog.ts            # UpgradeDef type, costAtLevel, isMaxed
│       ├── upgradeApplier.ts            # levels → EffectiveGameplayParams
│       ├── gameplayState.ts             # cash, upgrade levels, weapon counts, events
│       ├── compoundAsteroid.ts          # Matter compound body per live-component; split/extract
│       ├── asteroidGraph.ts             # BFS split helper (pure, tested)
│       ├── chunkTarget.ts               # unified target query surface for laser/missile
│       ├── asteroidSpawner.ts           # factory for random asteroids
│       ├── circularShapeGenerator.ts    # procedural asteroid layout generator
│       ├── materials.ts                 # 9-tier material ladder (Dirt → Diamond), HP + reward
│       ├── connectedComponents.ts       # BFS graph utility
│       ├── shape.ts                     # chunk shape types
│       ├── rng.ts                       # seeded RNG
│       ├── palette.ts                   # color palette
│       ├── saveState.ts                 # versioned localStorage snapshot (v:1)
│       ├── offlineProgress.ts           # offline elapsed → award (8h cap)
│       └── cashRate.ts                  # EMA cash/sec tracker (tau=60s)
├── README.md
├── ROADMAP.md
└── CLAUDE.md                            # you are here
```

## Source history

This project is a **port of an earlier Unity prototype** (local-only, not public). When porting a new mechanic, read the corresponding C# file in the Unity repo first — the design and tuning are the canonical reference. Unity CSharp maps to TS/Phaser cleanly:

| Unity | Phaser 3 + Matter |
|---|---|
| `Rigidbody2D` | `this.matter.add.image(...)` / `.add.sprite(...)` |
| `Collider2D` | body shape via `setCircle` / `setRectangle` / `setBody` |
| `OnCollisionStay2D` | `matter.world.on('collisionactive', cb)` |
| `OnTriggerEnter2D` | `isSensor: true` + `'collisionstart'` event |
| `kinematic` body | `setStatic(true)` or `setIgnoreGravity + setVelocity(0)` |
| `FixedUpdate` | `scene.update(time, delta)` |
| `Awake` / `Start` | `Scene.create()` |
| `MonoBehaviour` singleton | module-scope object, or a dedicated Scene |
| `PlayerPrefs` | `localStorage` |
| `ParticleSystem` | `scene.add.particles(...)` or hand-rolled tweened shapes |
| `Canvas` UI | overlay Scene with `Phaser.GameObjects.Text` or DOM |

## Architecture patterns

- **Weapons are plug-ins.** Each weapon implements `WeaponBehavior` (`src/game/weapons/`) and is registered in `weaponCatalog.ts`. GameScene is weapon-agnostic — adding a weapon = one behavior file + one catalog entry. Do not scatter weapon-specific logic into GameScene.
- **Cross-scene handoff via `game.registry`.** Parallel scenes can't receive events fired during a sibling's `create()` (see gotcha below). Phase 7 uses `game.registry` keys (`pendingSnapshot`, `offlineAward`, `offlineElapsedMs`) as a consume-once mailbox that survives scene restarts. Use this pattern for any GameScene→UIScene data that must cross the `create()` boundary.
- **Devtools handles.** `window.__GAME__` (Phaser.Game) and `window.__STATE__` (gameplayState) are exposed unconditionally in `main.ts`. Use these for in-console inspection; no need to add more.

## Phaser + Matter gotchas (fill in as we hit them)

- **Static bodies can still be teleported via `setPosition` and broadphase updates.** Used for the orbiting saw blade and arbor in `GameScene.ts` — both static + manual orbit positioning.
- **Saw blades are static (not sensors).** They block chunks physically AND deal damage via `collisionstart`/`collisionactive`. The arbor is also static and blocks but doesn't damage (kind `'arbor'` is not routed in the collision handler).
- **Matter doesn't generate pairs between two static bodies.** No collision between the static saw blade and the static arbor even though they overlap geometrically.
- **`body.gameObject` is only populated when the body was created through Phaser's matter wrappers** (`this.matter.add.image/sprite/...`). Raw `this.matter.add.rectangle({ isStatic: true })` arena walls do NOT have a `gameObject` reference — check for `undefined` in collision handlers.
- **Asteroids are Matter compound bodies, not welded chunks.** As of Phase 6.5, each asteroid is ONE `Matter.Body.create({ parts })` — no welds. Killing a chunk → `Body.setParts(compound, remaining, false)` + spawn a loose dead chunk with inherited `v + ω × r`. When the kill disconnects the live-chunk graph, `applyKillAndSplit` + `CompoundAsteroid.split()` tear down the parent and build N child compounds. Per-part collision routing via `part.plugin.{ kind, asteroid, chunkId }`. `enforceWeaponBarriers` is GONE — Matter's native solver handles compound-vs-static pile pressure natively.
- **Compound body construction: create parts at LOCAL offsets, not world positions.** `Matter.Bodies.rectangle(localX, localY, w, h)` then `Matter.Body.create({ parts })` (NO `position` key) then `Matter.Body.setPosition(body, { x: spawnX, y: spawnY })`. Passing pre-positioned parts AND a `position` to `Body.create` produces a corrupt compound where the parent body's vertices end up at roughly 2× the intended position — silent, broadphase ignores the body, ZERO collision pairs generated. Took hours to diagnose. Applies to both initial spawn and `fromPartsOfParent` (split path).
- **Compound-body collision events report the specific part, not the parent.** `pair.bodyA` points at the chunk part that actually collided. Read `pair.bodyA.plugin` to get the chunkId + asteroid. The parent (auto-synthesized by `Body.create` when `parts.length ≥ 2`) has an empty `plugin` object — never match on the parent.
- **Channel walls need a thicker collider than visual.** Visual 12px strip is cosmetic; Matter collider is 40px deep, extending OUTWARD from the channel face. Large piles otherwise penetrate a thin static wall even at 20/14 position/velocity iterations. `CHANNEL_WALL_COLLIDER_THICKNESS` vs `CHANNEL_WALL_THICKNESS` in `GameScene.ts`.
- **Per-body `gravityScale` is `{ x, y }`, not a scalar.** Mutate via `(body as unknown as { gravityScale: { x, y } }).gravityScale = { x: 0, y: multiplier }`. Phaser wraps most body setters but not this one. Used by Phase 6 Fall Speed and by compound bodies (which set `{x:0, y:0}` so kinematic fall drives Y velocity directly).
- **Parallel scenes launch AFTER `create()` completes — subscribers don't see events fired during the launcher's `create()`.** In `main.ts`, GameScene is added first with `{ active: true }`, and GameScene.create() calls `this.scene.launch('ui')` at the end. UIScene's `create()` runs on the NEXT tick, so any event emitted inside GameScene.create (e.g. `gameplayState.loadSnapshot` → `cashChanged`) is lost on UIScene. Fix: seed UI state from the current authoritative value at UIScene create-time (`cashText = ${gameplayState.cash}`), then subscribe for subsequent events. Don't assume "event fired in sibling scene = received."
- **`CanvasRenderingContext2D` via `this.textures.createCanvas(key, w, h).getContext()`.** Phaser's `Graphics` primitive doesn't support linear/radial gradients; use the canvas 2D context directly for gradient fills. After drawing, call `ct.refresh()` so Phaser uploads the canvas to the GPU texture. Used for per-material chunk textures + baked gem glow halos (textures are 18×18 with 3px glow padding around the 12×12 body).

## Design invariants

Load-bearing behaviors that are easy to silently break are documented in [DESIGN_INVARIANTS.md](DESIGN_INVARIANTS.md) at the repo root. When touching physics, collision routing, weapons, or save/load code, read the relevant section and verify you're not violating an invariant. Add new invariants there as load-bearing decisions land.

## Tests

- **Vitest** for pure logic (cost formulas, economy math, weapon catalog, upgrade appliers, gameplayState, shape generator, material ladder + distribution, asteroid graph split, save state, offline progress, cash rate) — lives under `src/**/*.test.ts`. 122 tests across 11 files. Run with `npm test`. **Bump the count here when you add or remove tests** — it drifts otherwise.
- **Playwright** for golden-path smoke — `tests/e2e/smoke.spec.ts` boots the game, waits 30s, asserts non-zero saw hits, rotating asteroids, and no console errors. Run with `npm run test:e2e`. Tripwire against refactor drift — a subset of `DESIGN_INVARIANTS.md`.

## Deploy

Repo at https://github.com/muwamath/asteroid-grinder. Live build at https://muwamath.github.io/asteroid-grinder/ via `.github/workflows/deploy.yml` — deploys on every push to `main`. `vite.config.ts` sets `base: './'` so assets resolve on any subpath.

## Commit messages

Per global: one-line, terse, lowercase OK, no body unless genuinely non-obvious, no `Co-Authored-By:` trailer. The roadmap and memory carry the "why" — don't duplicate it in commits.

## Files that are mine (gitignored) vs yours

- `node_modules/`, `dist/`, `.vite/` — gitignored.
- Private scratch (`todo.md`, `.remember/`, etc.) — don't read unless explicitly pointed at.
- Everything else under `src/`, `index.html`, configs, docs — tracked.
