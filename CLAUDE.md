# Asteroid Grinder — project conventions for Claude Code

This file is read automatically by Claude Code at session start. It documents project-specific conventions and workflow expectations. Overlay on top of the global `~/.claude/CLAUDE.md`, not a duplicate.

## Engine and stack

- **Phaser 3** (Matter.js physics) + **TypeScript** + **Vite**.
- Dev server: `npm run dev` → http://127.0.0.1:5173.
- Target platform: desktop + mobile web browsers. No native packaging, no WebGL-engine gymnastics.
- Node 22+ / npm 10+ assumed.

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
│       ├── upgradeCatalog.ts            # UpgradeDef type, costAtLevel, isMaxed
│       ├── upgradeApplier.ts            # levels → EffectiveGameplayParams
│       ├── gameplayState.ts             # cash, upgrade levels, weapon counts, events
│       ├── asteroid.ts                  # asteroid + chunk model, damage, fracture
│       ├── asteroidSpawner.ts           # factory for random asteroids
│       ├── circularShapeGenerator.ts    # procedural asteroid layout generator
│       ├── connectedComponents.ts       # BFS graph utility
│       ├── shape.ts                     # chunk shape types
│       ├── rng.ts                       # seeded RNG
│       └── palette.ts                   # color palette
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

## Phaser + Matter gotchas (fill in as we hit them)

- **Static bodies can still be teleported via `setPosition` and broadphase updates.** Used for the orbiting saw blade and arbor in `GameScene.ts` — both static + manual orbit positioning.
- **Saw blades are static (not sensors).** They block chunks physically AND deal damage via `collisionstart`/`collisionactive`. The arbor is also static and blocks but doesn't damage (kind `'arbor'` is not routed in the collision handler).
- **Matter doesn't generate pairs between two static bodies.** No collision between the static saw blade and the static arbor even though they overlap geometrically.
- **`body.gameObject` is only populated when the body was created through Phaser's matter wrappers** (`this.matter.add.image/sprite/...`). Raw `this.matter.add.rectangle({ isStatic: true })` arena walls do NOT have a `gameObject` reference — check for `undefined` in collision handlers.
- **Pile pressure defeats the Matter solver.** Many welded chunks pressing on a static body (saw, walls) overwhelm the collision solver even at 20/14 position/velocity iterations — weld constraints fight collision resolution. Fix: `enforceWeaponBarriers()` in `update()` actively pushes alive chunks out of arbor, blade, and wall collision zones every frame. Dead chunks are excluded so they fall through to the death line.
- **Per-body `gravityScale` is `{ x, y }`, not a scalar.** Mutate via `(body as unknown as { gravityScale: { x, y } }).gravityScale = { x: 0, y: multiplier }`. Phaser wraps most body setters but not this one. Used by the Phase 6 Fall Speed upgrade: live chunks get a low `y` multiplier, dead chunks get reset to `1` so confetti stays snappy.
- **`CanvasRenderingContext2D` via `this.textures.createCanvas(key, w, h).getContext()`.** Phaser's `Graphics` primitive doesn't support linear/radial gradients; use the canvas 2D context directly for gradient fills. After drawing, call `ct.refresh()` so Phaser uploads the canvas to the GPU texture. Used for per-material chunk textures + baked gem glow halos (textures are 18×18 with 3px glow padding around the 12×12 body).
- **Weld `damping` goes in the `options` bag of `matter.add.constraint(a, b, length, stiffness, { pointA, pointB, damping: 0.4 })`.** Phaser's typings don't expose it — use a narrowed `unknown`-cast factory. Damping alone doesn't eliminate squish at stiffness 1; combine with high `constraintIterations` (16+) for best effect. Fully rigid asteroids need a compound-body rewrite (backlog).

## Tests

- **Vitest** for pure logic (cost formulas, economy math, weapon catalog, upgrade appliers, gameplayState, shape generator, material ladder + distribution) — lives under `src/**/*.test.ts`. 77 tests across 5 files. Run with `npm test`.
- **Playwright** for scene smoke tests (planned, not yet implemented) — will live under `tests/e2e/`.

## Deploy

Repo at https://github.com/muwamath/asteroid-grinder. No hosted deploy yet — local dev only. GH Pages setup deferred to final phase.

## Commit messages

Per global: one-line, terse, lowercase OK, no body unless genuinely non-obvious, no `Co-Authored-By:` trailer. The roadmap and memory carry the "why" — don't duplicate it in commits.

## Files that are mine (gitignored) vs yours

- `node_modules/`, `dist/`, `.vite/` — gitignored.
- Private scratch (`todo.md`, `.remember/`, etc.) — don't read unless explicitly pointed at.
- Everything else under `src/`, `index.html`, configs, docs — tracked.
