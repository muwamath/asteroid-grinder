# Asteroid Grinder Roadmap

Living document. Core game is live at https://muwamath.github.io/asteroid-grinder/. See `git log main` for the full shipped history (MVP + phases 1–10 + arena overhaul + prestige loop + upgrade audit + economy rebalance + real-gravity physics).

Backlog below is open work only, ranked P1–P4. Tactical todos (currently scoped to P1) are at the bottom — prune them as they land, don't strike-through.

---

## P1 — bugs + small polish (ship next)

- **Slot-marker state bug.** Some unlocked slots render no yellow ring; some occupied slots still show the ring. Audit `GameScene.redrawSlotMarker` + every install/uninstall/unlock transition that should trigger a redraw.
- **Weapon-count sidebar desync.** Seen 2026-04-19: 3 missiles installed on-field, left-panel badge reads `×1`. The sidebar label is driven by `gameplayState.weaponCount(typeId)` but live-installed instances can drift from that count (e.g. missile respawn / prestige free-slot / save-load path). Audit the paths that push a WeaponInstance into `weaponInstances` without bumping `weaponCount`, and reconcile on install/uninstall.
- **Sell refund prestige-free exploit.** Selling a weapon acquired via a `free.<type>` prestige slot refunds the Nth-buy curve value → net-cash gain per free slot. Thread `instancesBoughtThisRun(type)` + prestige `free.<type>` into `sellWeaponAt` so free-slot weapons refund $0.
- **Physics playtest — tunneling sweep.** Real gravity + accelerating piles may push chunks through static walls at solver limits. If tunneling appears, bump `positionIterations` / `velocityIterations` in `main.ts`.
- **Spawn-interval baseline retune.** Asteroids now accelerate under real gravity; original 1400ms baseline was sized for a terminal-velocity fall. Walk pacing once shelf piles settle — may need to lengthen interval so the grinder isn't saturated instantly.
- **Code-review follow-ups** (deferred 2026-04-17):
  - `startNewRun` → `ui.closeAllPanels()` before `stop+start`.
  - Run Config map preview: add a comment documenting its dependency on `scale.width/height` matching arena generation dimensions.
  - Re-roll button double-fires on desktop (`pointerdown` + `click` both invoke `rerollFn`) — remove one listener.
- **"Larger sooner" Asteroid Size curve.** Current linear +2/level feels under-powered early. Swap for non-linear / Fibonacci-ish so runs feel meaty fast. (Max level already raised 8→20 during the audit.)
- **Pacing & balance tuning pass.** Playtest 2026-04-19 after real-gravity + ×1/10 weapon cost shipped: run takes ~2× the desired duration, cores feel over-tuned (too rewarding / too tanky for current DPS curves), starting asteroid HP outpaces starting weapon DPS (or weapons under-tuned at L0), and `asteroids.chunkHp` upgrade is underpriced — nothing stops the player from scaling HP faster than damage. Retune the right lever (spawn rate / grinder DPS / vault `vaultHpMultiplier` / chunk-HP base+growth / weapon L0 DPS). Easier to diagnose once the P2 DPS-estimate + avg-HP HUD lands — do that first.

## P2 — content & mechanics

- **Missile range upgrade.** Missile acquisition / engagement range is currently fixed. Add a new upgrade lane + missile-behavior hook so players can buy longer reach.
- **Surface DPS + asteroid HP at decision points.** Show estimated DPS per weapon in the Install Weapon panel (and/or the sidebar weapon category icons) so players can compare before buying; show average chunk HP for the current Asteroid Quality + `chunkHp` level somewhere visible (HUD line or spawner sub-panel) so they can tell when their damage outruns / lags incoming hp. Pure-logic calc: `baseDps × upgradeMultipliers` for weapons; `tier × hpMultiplier` averaged over the tier distribution for HP. Distinct from the P4 live-DPS overlay — this is static / pre-purchase.
- **Dead-chunk slide tuning.** Current dead-chunk friction = 0.02, frictionAir = 0 ("space-like"). Walls use Matter default 0.1; Matter takes `min()` so the chunk is the floor. Dial the chunk value if glides feel too long.
- **New weapons.** One `WeaponBehavior` file + catalog entry each (from the Unity prototype backlog): Tesla Coil, Freeze Ray, Flak Cannon, Gravity Well, Rail Gun, Drone Swarm.
- **Saw shape library.** Alternate blade silhouettes (circular, bladed, star, crescent). Needs a `SawShape` concept (sprite + collider profile per shape) + a selector UI.

## P3 — art & audio pass

- **Background.** Flat `#1a1a28` → stars / nebula gradient / parallax / subtle animated field. Should read as "space" without distracting.
- **Shop-panel styling.** Typography, spacing, framing, hover/press feedback, category icon art.
- **Live-demo category icons.** Render each category's hero entity into the button (mini spinning saw in the Saw icon, etc.).
- **Palette + particle polish, general readability pass.**
- **Spark-burst upgrade.** Swap the procedural 1×1 white for a star/plus glyph, warmer toward centre.
- **Saw hub + blade sprites.** Bump procedural 64×64 art or ship proper assets.
- **Grinder chew particles.** Deferred from the grinder overhaul.
- **Lo-fi audio loop + chunky SFX.** New domain — no audio exists yet.

## P4 — scope expansions (maybe-later)

- **Per-weapon DPS / contribution overlay.** Kill-attribution plumbing already tracks `killerType` on every chunk death; this unlocks a dev/player overlay for cash/sec + kill share by weapon type. Also a natural moment to rename the stale `cashFromSaw` / `cashFromLine` / `killedBySaw` debug counters in `GameScene.ts` to per-weapon maps.
- **Achievements, cosmetics.**

## Won't fix / deferred

- **Chunk containment** — flying chunks from high-velocity saw hits stay in the game (intentional, 2026-04-16).
- **CI action versions** (`actions/*@v4/v5`, Node 20 deprecated June 2026) — bump when upstream replacements ship.

---

## Next todos (tactical, scoped to P1)

- [ ] Audit `redrawSlotMarker` + install/uninstall/unlock triggers; fix stale yellow-ring state.
- [ ] Patch `sellWeaponAt` refund to zero out when the sold weapon was `free.<type>`-credited.
- [ ] Live-playtest real-gravity piles for tunneling; raise iteration counts if observed.
- [ ] Retune `spawnIntervalMs` baseline for the accelerating-fall world.
- [ ] Apply three code-review follow-ups (closeAllPanels, Run Config comment, re-roll de-dupe).
- [ ] Rework Asteroid Size upgrade curve (linear → Fibonacci-ish).
