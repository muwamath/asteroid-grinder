# Compound-Body Asteroid Refactor — Design

**Date:** 2026-04-16
**Status:** Approved, ready for implementation plan
**Depends on:** Phase 6 (Asteroid Overhaul) — done
**Feeds:** Phase 7 (Save & offline) can start on top of this

## Problem

Asteroids today are built from one Matter body per 12×12 chunk, welded to each
neighbor through two point-constraints (stiffness 1, damping 0.4, constraint
iterations 16). Under pile pressure against a saw blade or channel wall, the
welds still oscillate and squish — even with `enforceWeaponBarriers()`
kinematically pushing every live chunk out of every weapon / wall circle each
frame. The root cause is that Matter's constraint solver and collision
resolution fight each other; no amount of tuning eliminates this short of
fewer constraints.

The Unity prototype didn't have this issue because each asteroid was one
`Rigidbody2D` with multiple `PolygonCollider2D`s — i.e. a compound body, no
welds. This spec replicates that model in Phaser 3 + Matter.

## Goals

1. **Rigid asteroids.** A live asteroid must behave as a single rigid body —
   it rotates, translates, collides with walls and weapons, and never visibly
   deforms under impact or pile pressure.
2. **Per-chunk damage & death.** Weapons still damage one chunk at a time,
   addressed by chunkId. A killed chunk detaches from the structure.
3. **Structural splitting.** Killing an interior chunk that disconnects the
   live-chunk graph splits the asteroid into N new independent compound
   bodies, one per connected component. Each sub-asteroid inherits the
   parent's pose + velocity + angular velocity at the moment of split.
4. **Preserve existing feel.** Per-material textures, gem glow halos, dead-
   chunk fade/shrink, kinematic fall speed, asteroid quality, core chunk
   tagging — all keep working.

## Non-goals

- No change to `CircularShapeGenerator`, `SeededRng`, material ladder, or
  shape/adjacency data types.
- No economy or gameplay-tuning changes (costs, HP, tier rewards, fall-speed
  magnitudes).
- No new weapons, upgrades, or UI. The shop is untouched.
- No save/offline work — that's Phase 7 and runs after this.

## User-visible behavior (target)

**Example (user-supplied):** a long 5-chunk asteroid `XXXXX` drifts down as
one rigid object. The laser kills the middle chunk. Immediately the structure
becomes three independent bodies:

- Left compound `XX` continues with the parent's velocity/rotation.
- Right compound `XX` continues with the parent's velocity/rotation.
- The dead middle chunk (shown small + faded) detaches with its own velocity
  (parent linear velocity plus the tangential contribution of parent angular
  velocity at its offset) and falls under normal gravity as confetti.

Over time the three bodies drift apart — each is a free rigid body from that
moment on.

## Data model

```
Asteroid (one per connected component of live chunks)
├─ compoundBody: Matter.Body
├─ chunks: Map<chunkId, ChunkPart>     # live chunks only
├─ adjacency: Map<chunkId, Set<chunkId>> # live-chunk graph; dead chunks pruned
└─ sprites: Map<chunkId, Phaser.GameObjects.Image>  # render-only, no physics

ChunkPart
├─ chunkId: string
├─ material: Material
├─ maxHp, hp: number
├─ isCore: boolean
├─ localOffset: { x: number, y: number }   # offset from compound center
└─ bodyPart: Matter.Body                   # part inside the compound,
                                           # tagged via plugin.chunkId + plugin.asteroid

DeadConfettiChunk (not a class — just a tagged Phaser.Physics.Matter.Image)
├─ data('kind') = 'chunk'
├─ data('dead') = true
├─ data('tier') = material.tier
├─ gravityScale = 1
└─ standard dynamic body; same physics profile as today's dead chunks
```

### Invariants

- Every live chunk belongs to exactly one `Asteroid`.
- Dead chunks are NEVER in an `Asteroid`; they're loose Matter images in
  `GameScene.chunkRegistry`.
- The `compoundBody` of an `Asteroid` is one Matter.Body. When there are ≥ 2
  chunks it is a compound (Matter synthesizes a parent, and `body.parts[1..N]`
  are the chunk parts). When there is 1 chunk it is a plain single body; the
  `Asteroid` wrapper still works uniformly by reading `chunks` rather than
  indexing into `body.parts`.
- Each `part.plugin` on a chunk part carries `{ chunkId, asteroid }` pointers
  so collision handlers resolve the right chunk without scanning.

## Kill flow & split logic

Collision handler:
```
onWeaponHit(part, weapon):
    asteroid = part.plugin.asteroid
    chunkId  = part.plugin.chunkId
    result = asteroid.damageChunk(chunkId, weapon.damage)
    if result.killed:
        asteroid.extractAndSplit(chunkId)
```

`Asteroid.extractAndSplit(chunkId)`:

1. **Extract the dead part.** Use `Matter.Body.setParts(compound, remainingParts, false)`
   to rebuild the compound without the dead part. (`false` = do not recompute
   the convex hull for the parent; we supply parts directly.)
2. **Spawn a loose dead chunk** at the part's current world position:
   `worldPos = compound.position + rotate(localOffset, compound.angle)`,
   with velocity `compound.velocity + cross(ω, offset)` (so it flings
   tangentially when the parent was spinning), `gravityScale = 1`,
   `data('dead') = true`, `data('tier') = material.tier`. Add to the scene's
   `chunkRegistry`. Start the fade/shrink visual (alpha 0.55, scale 0.8).
3. **Prune the adjacency graph.** Remove `chunkId` as a node; delete all edges
   that referenced it.
4. **Run connectedComponents(adjacency).**
   - If **1 component:** we're done — `setParts` from step 1 already updated
     the compound. Sprite bookkeeping updated. No split.
   - If **≥2 components:** call `split()`.

`Asteroid.split(components)`:

- For each component, build a new `Asteroid` instance:
  - Create a fresh compound body from that component's parts. Parts are
    re-created (fresh Matter bodies) because Matter doesn't support moving
    parts between parents. Each new part retains its chunkId, material, HP.
  - Position the new compound at the same world pose the parts currently
    occupy. Assign the parent's linear velocity + the rotational velocity
    contribution at each new compound's center of mass.
  - Assign `plugin.asteroid` on each part to the new wrapper.
  - Transfer the corresponding `Phaser.GameObjects.Image` sprites from the
    old wrapper to the new.
- Destroy the old compound body (`Matter.World.remove`) and the old `Asteroid`
  wrapper.
- Register all new `Asteroid` instances with `GameScene`.

### Grinder (death-line) path

Uses the same `onWeaponHit` shape with `damage = Infinity` and a side-effect
of `gameplayState.addCash(1)` per killed chunk. Per-part contact only — only
the chunk(s) actually touching the death-line sensor that tick get killed.
Matches the "slow, last-resort" grinder design: a thick asteroid gets chewed
from the bottom up over many ticks.

### Out-of-bounds cleanup

Every `update()` tick, for every live `Asteroid` and every loose dead chunk,
if `body.position.y > screenHeight + margin`, silently destroy it without
payout. Safety net for any body that escapes the playfield (e.g. a compound
whacked sideways off a saw and tumbled under the channel wall).

## Per-frame update loop

```
GameScene.update(time, delta):
    for asteroid in liveAsteroids:
        asteroid.applyKinematicFall(effectiveParams.fallSpeedMultiplier)
        asteroid.syncSprites()
        asteroid.checkOutOfBounds(screenHeight)

    for chunk in deadConfettiChunks:
        if chunk.y > screenHeight + margin: chunk.destroy()
        # else: Matter native physics handles gravity + walls + death-line
```

**Sprite sync** (once per Asteroid per frame):
```
cos = cos(body.angle); sin = sin(body.angle)
for (chunkId, sprite) in sprites:
    off = chunks[chunkId].localOffset
    sprite.x = body.position.x + (off.x * cos - off.y * sin)
    sprite.y = body.position.y + (off.x * sin + off.y * cos)
    sprite.rotation = body.angle
```

**Gone entirely:**
- `enforceWeaponBarriers()` — Matter resolves compound-vs-static natively now.
- Per-chunk `applyKinematicFall()` that iterated every live chunk image; becomes
  per-asteroid `setVelocityY` on the compound.
- Weld constraints and `weldBodies()`, `detachChunk()`, `constraintsByEdge`
  bookkeeping in the old `Asteroid`.

## Collision wiring

Matter's `collisionstart` / `collisionactive` pairs include the actual sub-part
that collided when one body is a compound: `pair.bodyA` or `pair.bodyB` is the
part, and `part.parent` is the compound's parent body. We:

1. Read `pair.bodyA.plugin` and `pair.bodyB.plugin` to find `{ asteroid, chunkId }`.
2. Route to the weapon handler with `part` + `weapon`.
3. Loose dead confetti chunks are single-body Matter images — their `body`
   is its own root. The same `plugin` convention applies (plugin.chunkId
   set on the body directly), so handlers unify on one code path.

## Scale / performance

- Sprite-tracking cost: `N_live_chunks × (1 cos/sin + 2 mults + setPosition)`
  per frame. At 500 chunks across 10 asteroids, well under 1 ms. Phaser
  batches sprites sharing a texture atlas.
- BFS cost per kill: O(V + E) on ≤ a few hundred live chunks per asteroid.
  Runs at most once per chunk-death. Negligible.
- Compound rebuild cost: full rebuild only on actual disconnect. Surgical
  `setParts` fast-path for the common case (rim-chunk death). Compound body
  creation in Matter is allocation-ish but not frame-crushing at our scale.

## Testing strategy

### New pure-logic tests

`src/game/asteroidGraph.test.ts` — isolates split math from Matter:

```
applyKillAndSplit(adjacency, killedChunkId) → {
  prunedAdjacency: Map<string, Set<string>>,
  components: string[][]
}
```

Cases:
- Kill a leaf chunk in a chain → 1 component.
- Kill a bridge in `XXXXX` → 2 components `[[X,X], [X,X]]` (per user's example).
- Kill a chunk in a ring → 1 component (ring stays connected).
- Kill the only chunk → 0 components.
- Kill a chunk at the bend of an L-shape → 1 or 2 components per adjacency.
- Kill the core chunk → surviving components each retain their subset; the
  `isCore` flag is part of per-chunk state, not tested here.

### Preserved tests

- `connectedComponents.test.ts` — delegate target, no changes.
- `circularShapeGenerator.test.ts` — shape generation unchanged.
- `materials.test.ts`, `upgradeApplier.test.ts`, etc. — unrelated.

### Integration / smoke (Chrome DevTools MCP)

- Spawn one asteroid, confirm rigid fall (no wiggle, no internal squish).
- Laser the interior of a long asteroid, confirm visible split into two live
  compounds + one dead confetti chunk.
- Drop an asteroid into the grinder, confirm per-part chew-from-bottom with
  $1-per-chunk payout.
- Stack multiple asteroids onto a 6-blade saw, confirm no squish and no
  need for barrier pushes.
- Live-inspect with `?debug` + `window.__GAME__`:
  `scene.asteroids.length`, `asteroid.compoundBody.parts.length - 1` (live
  chunk count), `scene.deadChunkRegistry.size`.

## Rollout plan

Work ships on a fresh `feature/compound-asteroids` branch off `main`.

1. **Pure split helper + tests.** Add `asteroidGraph.ts` and test file.
   Nothing wired yet.
2. **New `Asteroid` class.** Implement alongside old one with a different
   class name (`CompoundAsteroid`?) or behind a feature flag.
3. **Switch the spawner + collision routing.** `AsteroidSpawner` emits new
   class. Collision handlers route via `part.plugin`.
4. **Simplify GameScene.** Delete `enforceWeaponBarriers()`, flatten
   `applyKinematicFall()`, remove dead `refreshFallSpeed` scaffolding if
   any remains.
5. **Delete welded-constraint code paths.** Remove old `Asteroid`,
   `weldBodies`, `constraintsByEdge`, adjacency pruning inside old
   `detachChunk`. Keep `shape.ts`, `connectedComponents.ts`,
   `circularShapeGenerator.ts`.
6. **Code review pass** (required per global conventions — fresh reviewer
   agent with no implementation bias).
7. **Chrome verification + docs.** Update `ROADMAP.md` (mark Backlog item
   done), `CLAUDE.md` "Phaser + Matter gotchas" section (compound bodies
   replace the weld-damping note), and `README.md` if feature-set language
   changes.
8. **FF-merge to main.**

## Rollback

Revert = `git branch -D feature/compound-asteroids` before merge, or
`git revert <merge-commit>` after. Asteroids are ephemeral runtime state
— no save-data migration.

## Open implementation details (not design gates)

- Exact API surface of `Asteroid` class (public methods, constructor
  signature) — writing-plans will lay this out.
- Whether to keep a thin `Asteroid` wrapper per single-chunk sub-asteroid, or
  collapse trivial 1-chunk components to loose dead-style dynamics. Default:
  keep as 1-part compound for uniformity; revisit if it causes weirdness.
- Initial spawn rotation / angular velocity — default 0, tune later if a
  spin-on-spawn feels nicer.
- Matter plugin field naming — `plugin.chunkId` vs a custom label; decide
  when writing code.
