# Upgrade Audit — 2026-04-19

Companion to ROADMAP §4. This audit defines the **authoritative upgrade paths** across every player-upgradeable entity, and is the source of truth feeding the economy rebalance.

Two passes:

- **Pass 1 — paths** (this doc, now): what upgrades exist, what's renamed, what's added, what's removed.
- **Pass 2 — economy** (to follow): cost curves, max levels, per-level deltas.

Pass 1 lock-in: all entity paths below are decided and ready to wire into `weaponCatalog.ts` + `upgradeApplier.ts`. Implementation happens as part of Pass 2.

---

## Pass 1 — Locked upgrade paths

### In-run (per-run, reset on prestige)

| # | Entity | Upgrade | Status | Notes |
|---|---|---|---|---|
| 1 | Grinder | `grinder.damage` | keep | |
| 2 | Grinder | `grinder.spinSpeed` | keep | |
| 3 | Grinder | `grinder.bladeSize` | keep | |
| 4 | Saw | `saw.damage` | keep | |
| 5 | Saw | `saw.bladeCount` | keep | caps at 5 (geometry-bound around arbor) |
| 6 | Saw | `saw.spinSpeed` | keep | blade self-rotation |
| 7 | Saw | `saw.orbitSpeed` | keep | revolution around arbor |
| 8 | Saw | `saw.bladeSize` | keep | |
| 9 | Laser | `laser.aimSpeed` | keep | |
| 10 | Laser | `laser.range` | keep | |
| 11 | Laser | `laser.damage` | keep | |
| 12 | Laser | `laser.cooldown` | keep | floor 0.1s |
| 13 | Missile | `missile.fireRate` | keep | |
| 14 | Missile | `missile.damage` | keep | AOE |
| 15 | Missile | `missile.blastRadius` | keep | |
| 16 | Missile | `missile.speed` | keep | |
| 17 | Missile | `missile.homing` | keep | continuous scaling (L0=none, L10=strong) |
| 18 | Blackhole | `blackhole.pullRange` | keep | |
| 19 | Blackhole | `blackhole.pullForce` | keep | attracts live, repels dead (yoked) |
| 20 | Blackhole | `blackhole.coreSize` | keep | |
| 21 | Blackhole | `blackhole.coreDamage` | keep | |
| 22 | Blackhole | `blackhole.maxTargets` | keep | |
| 23 | Spawner | `spawn.rate` | **renamed** | was `asteroids.dropRate`; moved to new `spawn` category |
| 24 | Spawner | `spawn.amplitude` | **new** | horizontal sweep width of the oscillating spawner |
| 25 | Asteroid body | `asteroids.chunkHp` | keep | |
| 26 | Asteroid body | `asteroids.asteroidSize` | keep | |
| 27 | Asteroid body | `asteroids.quality` | keep | name kept (opacity accepted) |
| 28 | Asteroid body | `asteroids.fallSpeed` | keep | |

**In-run total: 28 upgrades across 7 entities.**

### Prestige shop (meta, persists across runs)

| # | Family | Entry | Status | Notes |
|---|---|---|---|---|
| 1 | free-weapon | `free.saw` | keep | |
| 2 | free-weapon | `free.laser` | keep | |
| 3 | free-weapon | `free.missile` | keep | |
| 4 | free-weapon | `free.blackhole` | keep | no grinder entry — grinder is a singleton |
| 5 | multiplier | `mult.cash` | keep | |
| 6 | multiplier | `mult.damage` | keep | |
| 7 | multiplier | `discount.upgrade` | keep | caps at -50% |
| 8 | multiplier | `prestige.shardMultiplier` | **new** | global Shard multiplier (compounds with `shard.yield` per-vault) |
| 9 | material | `refinement` | keep | filler % reduction, floor 50% |
| 10 | economy | `offline.cap` | keep | 8→12→24→48h |
| 11 | economy | `offline.rate` | **new** | scale offline earnings rate, not just the cap |
| 12 | economy | `shard.yield` | keep | +1 Shard per vault core per level |
| 13 | economy | `start.cash` | keep | |
| ~~—~~ | ~~economy~~ | ~~`arena.preUnlockedSlots`~~ | **removed** | Dead since slot-lock removal (2026-04-17). Restore only if locked-slot mechanic returns as a separate design. |

**Prestige total: 13 entries (was 12, net +1: +2 new, -1 removed).**

### Grand total: 41 upgrade entries.

---

## Code delta required

Structural changes to `src/game/weaponCatalog.ts` + `src/game/upgradeApplier.ts`:

1. **Add new category** `spawn` — container for spawner upgrades.
2. **Rename** `asteroids.dropRate` → `spawn.rate`. Move from asteroids category to spawn category. Preserve save-state compatibility via migration in `saveState.ts` (map old id → new id on load) or bump schema version.
3. **Add** `spawn.amplitude` — needs:
   - new field in `EffectiveGameplayParams` (e.g. `spawnAmplitudeMultiplier`)
   - per-level delta constant in `upgradeApplier.ts`
   - wire-up in `GameScene` where the oscillator amplitude is currently a baked constant
4. **Add** prestige shop entries `prestige.shardMultiplier`, `offline.rate` — update `prestigeShopCatalog.ts`, effect application in `prestigeEffects.ts`.
5. **Remove** prestige entry `arena.preUnlockedSlots` — delete from catalog + effects + tests. Audit save state for orphaned levels (ignore on load).
6. **Tests:**
   - extend `upgradeApplier.test.ts` for `spawn.*` behavior
   - extend `prestigeEffects.test.ts` for new entries
   - extend `prestigeShopCatalog.test.ts` for entry count + removal
   - update any test referencing `asteroids.dropRate` to use `spawn.rate`

---

## Pass 2 — economy (locked)

### Framework

**Cost tiers** (OP = "damages/affects more than 1 chunk per action"):

| Tier | Applies to | baseCost | growth |
|---|---|---|---|
| S | single-chunk damage, range, aim, fireRate | $15–$30 | 1.25–1.30 |
| QoL | speed / cooldown / count with geometry caps | $25–$50 | 1.30–1.40 |
| OP | multi-chunk: AOE, blast, pullRange, coreSize, bladeSize | $100–$300 | 1.40–1.60 |
| Mega-OP | compounding multi-chunk or global multipliers (spawn.rate, saw.bladeCount) | $200–$2,500 | 1.80+ |

**Correlation rule:** every weapon's primary damage axis (`grinder.damage`, `saw.damage`, `laser.damage`) shares the `asteroids.chunkHp` cost curve (Tier S: $15, 1.25, ∞, matched +1/lvl). Missile and Blackhole primary damage are OP-tier because their attacks are inherently multi-chunk.

**Pacing target:** late-stage income ≈ $5k/sec. Endgame upgrades (around L25 for OP, L60 for Tier S) cost 1–2 hours of farming each.

### Reward formula fix (required)

`GameScene.collectDeadAtDeathLine` (~line 574):

```ts
// BEFORE
const baseReward = killerType === 'grinder' ? 1 : tier;
// AFTER
const baseReward = killerType === 'grinder' ? 1 : tier * hpMultiplier;
```

Grinder stays flat $1 (design invariant). `hpMultiplier` plumbed from `EffectiveGameplayParams.maxHpPerChunk`. Without this, `asteroids.chunkHp` is a dominated upgrade.

### Locked per-upgrade values

#### Grinder

| Upgrade | baseCost | growth | maxLevel | per-lvl |
|---|---|---|---|---|
| `grinder.damage` | $15 | 1.25 | ∞ | +1 |
| `grinder.spinSpeed` | $40 | 1.35 | 15 | +0.4 |
| `grinder.bladeSize` | $100 | 1.50 | 10 | +0.1 |

#### Saw

| Upgrade | baseCost | growth | maxLevel | per-lvl |
|---|---|---|---|---|
| `saw.damage` | $15 | 1.25 | ∞ | +1 |
| `saw.bladeCount` | $2,500 | 4.00 | 5 | +1 blade |
| `saw.spinSpeed` | $25 | 1.30 | 10 | +0.005 |
| `saw.orbitSpeed` | $30 | 1.30 | ∞ | +0.6 |
| `saw.bladeSize` | $500 | 1.80 | 8 | +2 |

#### Laser

| Upgrade | baseCost | growth | maxLevel | per-lvl |
|---|---|---|---|---|
| `laser.aimSpeed` | $30 | 1.30 | 20 | +16.5 deg/s |
| `laser.range` | $20 | 1.25 | ∞ | +20 px |
| `laser.damage` | $15 | 1.25 | ∞ | +0.5 DPS |
| `laser.cooldown` | $25 | 1.30 | 20 | -0.095s (floor 0.1s) |

#### Missile

| Upgrade | baseCost | growth | maxLevel | per-lvl |
|---|---|---|---|---|
| `missile.fireRate` | $100 | 1.40 | 20 | -0.225s (floor 0.5s) |
| `missile.damage` | $150 | 1.50 | ∞ | +1.5 |
| `missile.blastRadius` | $200 | 1.60 | ∞ | +4 px |
| `missile.speed` | $25 | 1.30 | ∞ | +12 px/s |
| `missile.homing` | $30 | 1.30 | 10 | +0.5 |

#### Blackhole

| Upgrade | baseCost | growth | maxLevel | per-lvl |
|---|---|---|---|---|
| `blackhole.pullRange` | $100 | 1.40 | ∞ | +8 px |
| `blackhole.pullForce` | $80 | 1.40 | ∞ | +0.00015 |
| `blackhole.coreSize` | $200 | 1.55 | ∞ | +3 px |
| `blackhole.coreDamage` | $150 | 1.50 | ∞ | +0.5 DPS |
| `blackhole.maxTargets` | $300 | 1.70 | 20 | +1 target |

#### Spawner

| Upgrade | baseCost | growth | maxLevel | per-lvl |
|---|---|---|---|---|
| `spawn.rate` | $200 | 2.20 | 12 | -130 ms (floor 300 ms) |
| `spawn.amplitude` | $80 | 1.50 | 10 | +10% sweep width |

#### Asteroid body

| Upgrade | baseCost | growth | maxLevel | per-lvl |
|---|---|---|---|---|
| `asteroids.chunkHp` | $15 | 1.25 | ∞ | +1 |
| `asteroids.asteroidSize` | $100 | 1.50 | 20 | +2 chunks |
| `asteroids.quality` | $150 | 1.55 | 8 | +1 tier |
| `asteroids.fallSpeed` | $50 | 1.35 | 9 | non-linear (`fallSpeedMultiplier` fn) |

#### Prestige Shop

| Entry | baseCost (Shards) | growth | maxLevel | Effect |
|---|---|---|---|---|
| `free.saw` | 3 | 1.6 | ∞ | +1 free saw/run |
| `free.laser` | 3 | 1.6 | ∞ | +1 free laser/run |
| `free.missile` | 3 | 1.6 | ∞ | +1 free missile/run |
| `free.blackhole` | 3 | 1.6 | ∞ | +1 free blackhole/run |
| `mult.cash` | 5 | 1.4 | ∞ | +10% cash/lvl |
| `mult.damage` | 6 | 1.4 | ∞ | +5% damage/lvl |
| `discount.upgrade` | 8 | 1.5 | 10 | -5% upgrade cost/lvl (cap -50%) |
| `prestige.shardMultiplier` **(new)** | 15 | 1.80 | 20 | +5% Shard yield/lvl (cap +100%) |
| `refinement` | 20 | 2.0 | 6 | -5% filler/lvl (floor 50%) |
| `offline.cap` | 25 | 3.0 | 3 | 8→12→24→48h |
| `offline.rate` **(new)** | 40 | 2.50 | 6 | +15% offline rate/lvl (cap +90%) |
| `shard.yield` | 30 | 2.0 | 5 | +1 Shard/vault core/lvl |
| `start.cash` | 5 | 1.5 | ∞ | +$50/lvl |

#### Weapon purchase cost (separate curve, not an upgrade)

| Axis | Value |
|---|---|
| Scope | Global — Nth total non-grinder weapon purchase this run |
| Formula | `cost(N) = N === 1 ? 0 : 1000 * 3^(N - 2)` |
| 1st purchase | $0 (always free — guarantees starting weapon) |
| Free-slot interaction | `free.*` prestige grants $0 on that buy but increments N |

| N | Cost |
|---|---|
| 1 | $0 |
| 2 | $1,000 |
| 3 | $3,000 |
| 4 | $9,000 |
| 5 | $27,000 |
| 6 | $81,000 |
| 7 | $243,000 |
| 8 | $729,000 |
| 9 | $2.19M |
| 10 | $6.56M |

### Pass 2 interactions

- `mult.damage` (+5%/lvl) amplifies damage against HP-inflated chunks from `chunkHp`. Self-balancing post-reward-fix.
- `discount.upgrade` -50% cap is load-bearing: in-run upgrade costs scale aggressively (Tier S growth 1.25 × L70 ≈ $550M). Cap prevents trivialization.
- `shard.yield` L5 + `prestige.shardMultiplier` L20 → vault core drops `(1+5) × 2.0 = 12 Shards`. Meaningful endgame without runaway.
- `spawn.rate` is the single most impactful in-run upgrade (global cash/sec multiplier, ~6× throughput at cap). Priced accordingly.
