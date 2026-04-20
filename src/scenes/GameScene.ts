import Phaser from 'phaser';
import { CompoundAsteroid, CHUNK_PIXEL_SIZE, type WeaponKillSource } from '../game/compoundAsteroid';
import { computeChunkReward } from '../game/rewardFormula';
import { AsteroidSpawner } from '../game/asteroidSpawner';
import { gameplayState } from '../game/gameplayState';
import { BASE_PARAMS, applyUpgrades, type EffectiveGameplayParams } from '../game/upgradeApplier';
import { WEAPON_TYPES, weaponBuyCost } from '../game/weaponCatalog';
import { CashRateTracker } from '../game/cashRate';
import { saveToLocalStorage, clearSave, loadFromLocalStorage, type SaveStateV3 } from '../game/saveState';
import { type WeaponBehavior, createBehavior, allBehaviorPrototypes } from '../game/weapons';
import { SawBehavior } from '../game/weapons/sawBehavior';
import { GrinderBehavior } from '../game/weapons/grinderBehavior';
import { MATERIALS, type Material, textureKeyFor } from '../game/materials';
import type { ChunkTarget } from '../game/chunkTarget';
import type { ChunkPartPlugin } from '../game/compoundAsteroid';
import { applyKillAndSplit } from '../game/asteroidGraph';
import { CAT_DEAD_CHUNK, MASK_DEAD_CHUNK } from '../game/collisionCategories';
import { computeVaultShardReward } from '../game/prestigeAward';
import { prestigeState } from '../game/prestigeState';
import { applyPrestigeEffects } from '../game/prestigeEffects';
import { generateArena } from '../game/arena/arenaGenerator';
import {
  MIN_SLOTS,
  MAX_SLOTS,
  WALL_COLLIDER_THICKNESS,
  PHASE_STEP_RAD,
  SPAWN_MARGIN,
} from '../game/arena/arenaConstants';
import { startingUnlockedCount, unlockCost } from '../game/arena/slotState';
import type { ArenaLayout, SlotDef } from '../game/arena/arenaTypes';

const ARBOR_RADIUS = 12;

function seedFromString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h || 1;
}

const SPAWN_Y = -80;
const DEATH_LINE_Y = 1304;

const CHANNEL_TOP_Y = 160;

interface WeaponInstance {
  id: string;
  type: string;
  sprite: Phaser.Physics.Matter.Image;
  behavior: WeaponBehavior;
}

export class GameScene extends Phaser.Scene {
  private weaponInstances: WeaponInstance[] = [];
  private nextInstanceId = 0;
  arenaLayout?: ArenaLayout;

  private spawner!: AsteroidSpawner;
  private liveAsteroids: CompoundAsteroid[] = [];
  private deadChunks = new Set<Phaser.Physics.Matter.Image>();

  private effectiveParams: EffectiveGameplayParams = BASE_PARAMS;
  private spawnTimer: Phaser.Time.TimerEvent | null = null;

  private arenaWallBodies: MatterJS.BodyType[] = [];
  private arenaWallVisuals: Phaser.GameObjects.Rectangle[] = [];
  private screenEdgeWalls: MatterJS.BodyType[] = [];
  private slotMarkers = new Map<string, Phaser.GameObjects.Graphics>();
  private arenaDebugOverlay?: Phaser.GameObjects.Graphics;
  private spawnPhase = 0;
  // Upper bound used for spawn-x amplitude margin. Conservative — any
  // reasonable asteroid stays well inside the playfield.
  private readonly maxAsteroidRadius = 80;

  private debugMode = false;
  private debugText: Phaser.GameObjects.Text | null = null;
  private debugKey: Phaser.Input.Keyboard.Key | null = null;
  private weaponHits = 0;
  private killedBySaw = 0;
  private collectedAlive = 0;
  private collectedDead = 0;
  private cashFromSaw = 0;
  private cashFromLine = 0;
  private spawnedCount = 0;
  private spawnedChunks = 0;
  private pendingShardsThisRun = 0;

  private unsubs: Array<() => void> = [];
  private collisionHandler: ((event: Phaser.Physics.Matter.Events.CollisionStartEvent) => void) | null = null;
  private dragHandler: ((pointer: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject, dragX: number, dragY: number) => void) | null = null;

  private rateTracker: CashRateTracker = new CashRateTracker(60_000, 0);
  private lastEarnedAt = 0;
  private autosaveTimer: Phaser.Time.TimerEvent | null = null;
  private beforeUnloadHandler: (() => void) | null = null;

  constructor() {
    super('game');
    this.debugMode = new URLSearchParams(window.location.search).has('debug');
  }

  getPendingShardsThisRun(): number {
    return this.pendingShardsThisRun;
  }

  getEffectiveParams(): EffectiveGameplayParams {
    return this.effectiveParams;
  }

  preload(): void {
    this.makeChunkTextures();
    // Let each weapon behavior generate its own textures.
    for (const proto of allBehaviorPrototypes()) {
      proto.createTextures(this);
    }
  }

  create(): void {
    gameplayState.resetData();
    this.pendingShardsThisRun = 0;

    const snap = this.game.registry.get('pendingSnapshot') as SaveStateV3 | null;
    if (snap) {
      gameplayState.loadSnapshot({
        cash: snap.cash,
        levels: snap.levels,
        weaponCounts: snap.weaponCounts,
      });
      gameplayState.setInstancesBoughtThisRun(snap.instancesBoughtThisRun);
      gameplayState.setRunSeed(snap.runSeed);
      this.pendingShardsThisRun = snap.pendingShardsThisRun;
      this.rateTracker = new CashRateTracker(60_000, snap.emaCashPerSec);
      // Consume once — a future scene restart should NOT re-apply.
      this.game.registry.set('pendingSnapshot', null);
    } else {
      this.rateTracker = new CashRateTracker(60_000, 0);
    }
    this.lastEarnedAt = this.time.now;

    this.effectiveParams = applyPrestigeEffects(applyUpgrades(gameplayState.levels()), prestigeState.shopLevels());

    const { width, height } = this.scale;

    this.buildArena(width, height);
    // Arena seed is DERIVED from runSeed — never stored separately. This
    // makes "Start Run with a new seed" deterministically produce a new
    // arena (old design stored both, leading to stale arenaSeed surviving
    // a seed change).
    const arenaSeed = seedFromString(gameplayState.runSeed || 'default');
    this.arenaLayout = generateArena(arenaSeed, {
      width,
      height,
      minSlots: MIN_SLOTS,
      maxSlots: MAX_SLOTS,
    });
    this.buildArenaFromLayout(this.arenaLayout);
    gameplayState.initArenaSlots(this.arenaLayout.slots.map((s) => s.id));
    if (snap && snap.arenaSlotsUnlocked.length > 0) {
      // Restore from v3 snapshot — preserves every slot the player opened.
      for (const id of snap.arenaSlotsUnlocked) gameplayState.tryUnlockSlot(id, 0);
      if (snap.arenaFreeUnlockUsed) gameplayState.markFreeUnlockUsed();
    } else {
      this.applyStartingUnlocks();
    }
    // Redraw every marker now — starting unlocks fire BEFORE the subscription
    // handlers are wired below, so the unlocked visual state needs an explicit
    // sweep to reflect the initial mask.
    for (const slot of this.arenaLayout.slots) {
      const g = this.slotMarkers.get(slot.id);
      if (g) this.redrawSlotMarker(g, slot);
    }
    this.buildHud(width);
    this.wireCollisions();
    this.wireDrag();

    // Weapon instantiation:
    //   1) If we have v3 installations, instantiate at each saved slot.
    //   2) Otherwise fresh game — catalog startCount at stacked defaults.
    const unlockedTypes = WEAPON_TYPES.filter((w) => !w.locked && w.id !== 'grinder');
    const yBottom = DEATH_LINE_Y - ARBOR_RADIUS - 10;
    const ySpacing = ARBOR_RADIUS * 3;
    if (snap && snap.weaponInstallations.length > 0) {
      for (const inst of snap.weaponInstallations) {
        const slot = this.arenaLayout.slots.find((s) => s.id === inst.slotId);
        if (!slot) continue; // Layout changed — stale slotId silently dropped.
        const proto = createBehavior(inst.typeId);
        if (!proto) continue;
        const spawned = this.spawnWeaponInstance(inst.typeId, slot.x, slot.y);
        if (!spawned) continue;
        if (spawned.behavior instanceof SawBehavior && inst.clockwise === false) {
          spawned.behavior.setClockwise(false);
        }
        gameplayState.installWeapon(inst.slotId, inst.typeId, spawned.id);
      }
    } else {
      // No saved installations — could be a fresh boot, a post-prestige run,
      // or a Start Run with a new seed. Seed weapon counts from the catalog
      // FIRST, then auto-install at closest-to-center unlocked slots. Do NOT
      // call `buyWeapon` in the install loop — that would inflate
      // `instancesBoughtThisRun` and consume prestige free-weapon slots even
      // though the player never opened the picker.
      gameplayState.initWeaponCounts(
        Object.fromEntries(WEAPON_TYPES.filter((w) => !w.locked).map((w) => [w.id, w.startCount])),
      );
      void yBottom; void ySpacing;
      const sortedSlots = [...this.arenaLayout.slots]
        .filter((s) => gameplayState.isSlotUnlocked(s.id))
        .sort(
          (a, b) =>
            Math.hypot(a.x - width / 2, a.y - this.scale.height / 2) -
            Math.hypot(b.x - width / 2, b.y - this.scale.height / 2),
        );
      let slotCursor = 0;
      for (const wt of unlockedTypes) {
        for (let i = 0; i < wt.startCount; i++) {
          if (slotCursor >= sortedSlots.length) break;
          const slot = sortedSlots[slotCursor++];
          const inst = this.spawnWeaponInstance(wt.id, slot.x, slot.y);
          if (!inst) continue;
          gameplayState.installWeapon(slot.id, wt.id, inst.id);
        }
      }
    }
    if (!snap) {
      if (this.effectiveParams.startingCash > 0) {
        gameplayState.addCash(this.effectiveParams.startingCash, { silent: true });
      }
      const forceRestartCash = (this.game.registry.get('forceRestartCash') as number | undefined) ?? 0;
      if (forceRestartCash > 0) {
        gameplayState.addCash(forceRestartCash, { silent: true });
        this.game.registry.set('forceRestartCash', 0);
      }
    }

    this.spawnGrinder(width);

    // Final marker sweep — starting-unlocks fire BEFORE listeners are wired
    // below, and auto-installs fire BEFORE them too. Sweep once now so every
    // marker's visual reflects current state (yellow ring for unlocked empty,
    // nothing for installed, grey padlock for locked).
    for (const slot of this.arenaLayout.slots) {
      const g = this.slotMarkers.get(slot.id);
      if (g) this.redrawSlotMarker(g, slot);
    }

    const seed = gameplayState.runSeed ? seedFromString(gameplayState.runSeed) : undefined;
    this.spawner = new AsteroidSpawner(this, seed);
    this.rebuildSpawnTimer(this.effectiveParams.spawnIntervalMs);
    this.spawnAsteroid();

    this.unsubs.push(
      gameplayState.on('upgradeLevelChanged', () => {
        this.recomputeEffectiveParams();
      }),
    );
    this.unsubs.push(
      gameplayState.on('weaponCountChanged', (typeId, count) => {
        this.onWeaponCountChanged(typeId, count);
      }),
    );
    this.unsubs.push(
      gameplayState.on('cashEarned', (amount) => {
        const now = this.time.now;
        const dt = now - this.lastEarnedAt;
        this.lastEarnedAt = now;
        this.rateTracker.observe(amount, dt);
      }),
    );
    this.unsubs.push(prestigeState.on('shopLevelChanged', () => this.snapshotNow()));
    this.unsubs.push(prestigeState.on('shardsChanged', () => this.snapshotNow()));
    this.unsubs.push(
      gameplayState.on('slotUnlocked', (id) => {
        const slot = this.arenaLayout?.slots.find((s) => s.id === id);
        const g = this.slotMarkers.get(id);
        if (slot && g) this.redrawSlotMarker(g, slot);
      }),
    );
    this.unsubs.push(
      gameplayState.on('weaponInstalled', (slotId) => {
        const slot = this.arenaLayout?.slots.find((s) => s.id === slotId);
        const g = this.slotMarkers.get(slotId);
        if (slot && g) this.redrawSlotMarker(g, slot);
      }),
    );
    this.unsubs.push(
      gameplayState.on('weaponUninstalled', (slotId) => {
        const slot = this.arenaLayout?.slots.find((s) => s.id === slotId);
        const g = this.slotMarkers.get(slotId);
        if (slot && g) this.redrawSlotMarker(g, slot);
      }),
    );

    // F2 toggles the BSP / slot debug overlay (arena geometry). Backtick is
    // already taken by the HUD/debug-text toggle — don't double-bind.
    this.input.keyboard?.on('keydown-F2', () => this.toggleArenaDebugOverlay());

    const ui = this.scene.get('ui');
    const installListener = (payload: {
      slotId: string;
      typeId: string;
      x: number;
      y: number;
    }): void => {
      this.installWeaponAtSlot(payload.slotId, payload.typeId, payload.x, payload.y);
    };
    ui.events.on('install-weapon', installListener);
    this.unsubs.push(() => ui.events.off('install-weapon', installListener));

    this.autosaveTimer = this.time.addEvent({
      delay: 5000,
      loop: true,
      callback: () => this.snapshotNow(),
    });
    this.beforeUnloadHandler = () => this.snapshotNow();
    window.addEventListener('beforeunload', this.beforeUnloadHandler);

    this.events.once('shutdown', () => {
      for (const u of this.unsubs) u();
      this.unsubs = [];
      if (this.collisionHandler && this.matter?.world) {
        this.matter.world.off('collisionstart', this.collisionHandler);
        this.matter.world.off('collisionactive', this.collisionHandler);
      }
      this.collisionHandler = null;
      if (this.dragHandler && this.input) {
        this.input.off(Phaser.Input.Events.DRAG, this.dragHandler);
      }
      this.dragHandler = null;
      if (this.autosaveTimer) {
        this.autosaveTimer.remove(false);
        this.autosaveTimer = null;
      }
      if (this.beforeUnloadHandler) {
        window.removeEventListener('beforeunload', this.beforeUnloadHandler);
        this.beforeUnloadHandler = null;
      }
      if (this.debugKey) {
        this.debugKey.removeAllListeners();
        this.input.keyboard?.removeKey(this.debugKey);
        this.debugKey = null;
      }
      for (const inst of this.weaponInstances) {
        inst.behavior.destroy();
        inst.sprite.destroy();
      }
      this.weaponInstances = [];
    });

    this.scene.launch('ui');
  }

  update(_time: number, delta: number): void {
    const chunkTargets = this.buildChunkTargets();
    const raw = { liveAsteroids: this.liveAsteroids, deadChunks: this.deadChunks };
    for (const inst of this.weaponInstances) {
      inst.behavior.update(this, inst.sprite, delta, chunkTargets, this.effectiveParams, raw);
    }

    const maxY = this.scale.height + 120;
    const fall = this.effectiveParams.fallSpeedMultiplier;

    // Screen-edge walls are the only outer horizontal bound in the
    // procedural arena. enforceWalls keeps compound bodies inside.
    const wallInnerL = 0;
    const wallInnerR = this.scale.width;

    // Wake any asteroid whose chunks are near an active weapon (saw arbor
    // etc). Otherwise Matter's sleeping optimization hides the pile from
    // the orbiting blade and the saw passes through chunks without
    // pushing them. Wake radius = arbor + chunk half + margin.
    const wakeRadiusSq: { x: number; y: number; r2: number }[] = [];
    for (const inst of this.weaponInstances) {
      const wakeR = inst.behavior.bodyRadius + 20;
      wakeRadiusSq.push({ x: inst.sprite.x, y: inst.sprite.y, r2: wakeR * wakeR });
    }
    for (const ast of this.liveAsteroids) {
      if (!ast.body.isSleeping) continue;
      for (const zone of wakeRadiusSq) {
        const dx = ast.body.position.x - zone.x;
        const dy = ast.body.position.y - zone.y;
        if (dx * dx + dy * dy <= zone.r2 + 2500) { // +50px slop via r2 pad
          const Matter = (this.matter as unknown as {
            Sleeping: { set: (body: MatterJS.BodyType, isSleeping: boolean) => void };
          });
          Matter.Sleeping?.set?.(ast.body, false);
          // Fallback: direct property touch wakes body in all Matter versions.
          (ast.body as unknown as { isSleeping: boolean }).isSleeping = false;
          break;
        }
      }
    }

    for (let i = this.liveAsteroids.length - 1; i >= 0; i--) {
      const ast = this.liveAsteroids[i];
      if (!ast.isAlive) {
        ast.destroy();
        this.liveAsteroids.splice(i, 1);
        continue;
      }
      ast.applyKinematicFall(fall);
      // Kinematic wall barrier: Matter's solver can't always keep a heavy
      // pile inside a thin channel. After physics steps, find the chunk
      // part that's penetrated the wall deepest and shove the whole
      // compound body back until no part escapes. Zero the inward x
      // velocity so the pile doesn't keep pressing outward.
      ast.enforceWalls(wallInnerL, wallInnerR);
      ast.syncSprites();

      // Grinder blades now handle live-chunk kills via collision routing —
      // the old DEATH_LINE_Y chew loop is gone. If a live chunk somehow
      // bypasses the blades and crosses the death line, the visible red
      // strip makes the failure obvious; treat it as a bug, not gameplay.

      if (ast.isOutOfBounds(maxY)) {
        ast.destroy();
        const idx = this.liveAsteroids.indexOf(ast);
        if (idx >= 0) this.liveAsteroids.splice(idx, 1);
      }
    }

    for (const chunk of this.deadChunks) {
      if (!chunk.active) {
        this.deadChunks.delete(chunk);
        continue;
      }
      if (chunk.y > DEATH_LINE_Y) {
        this.collectDeadAtDeathLine(chunk);
      } else if (chunk.y > maxY) {
        this.deadChunks.delete(chunk);
        chunk.destroy();
      }
    }

    if (this.debugMode && this.debugText) {
      const fps = Math.round(this.game.loop.actualFps);
      const world = this.matter.world.localWorld as unknown as { bodies: unknown[] };
      const bodies = world.bodies.length;
      let liveChunkCount = 0;
      for (const a of this.liveAsteroids) liveChunkCount += a.chunks.size;
      const rate = this.rateTracker.rate();
      this.debugText.setText(
        [
          `FPS ${fps}  ·  bodies ${bodies}  ·  asteroids ${this.liveAsteroids.length}  ·  live ${liveChunkCount}  ·  dead ${this.deadChunks.size}`,
          `spawned ${this.spawnedCount} asteroids · ${this.spawnedChunks} chunks`,
          `hits ${this.weaponHits}  ·  killed ${this.killedBySaw}`,
          `collected dead ${this.collectedDead}  ·  collected alive ${this.collectedAlive}`,
          `cash $${gameplayState.cash} (saw $${this.cashFromSaw} + line $${this.cashFromLine})  ·  rate $${rate.toFixed(2)}/s`,
          `weapons ${this.weaponInstances.length}  ·  dmg ${this.effectiveParams.sawDamage}  ·  spawn ${this.effectiveParams.spawnIntervalMs}ms`,
        ].join('\n'),
      );
    }
  }

  private buildChunkTargets(): ChunkTarget[] {
    const targets: ChunkTarget[] = [];
    for (const ast of this.liveAsteroids) {
      const body = ast.body;
      const vx = body.velocity.x;
      const vy = body.velocity.y;
      const w = body.angularVelocity;
      const angle = body.angle;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      for (const chunk of ast.chunks.values()) {
        const pos = chunk.bodyPart.position;
        const ox = chunk.localOffset.x;
        const oy = chunk.localOffset.y;
        const tvx = -w * (ox * sin + oy * cos);
        const tvy =  w * (ox * cos - oy * sin);
        const chunkId = chunk.chunkId;
        targets.push({
          id: `${ast.id}/${chunkId}`,
          x: pos.x, y: pos.y,
          vx: vx + tvx, vy: vy + tvy,
          dead: false, tier: chunk.material.tier,
          damage: (amount, killer) => this.damageLiveChunk(ast, chunkId, amount, killer),
        });
      }
    }
    let deadIdx = 0;
    for (const dead of this.deadChunks) {
      if (!dead.active) continue;
      const tier = (dead.getData('tier') as number | undefined) ?? 1;
      const body = dead.body as MatterJS.BodyType;
      targets.push({
        id: `D${deadIdx++}`,
        x: dead.x, y: dead.y,
        vx: body.velocity.x, vy: body.velocity.y,
        dead: true, tier,
        damage: (_amount, _killer) => false,
      });
    }
    return targets;
  }

  damageLiveChunk(
    ast: CompoundAsteroid,
    chunkId: string,
    amount: number,
    killerType: WeaponKillSource,
  ): boolean {
    const result = ast.damageChunk(chunkId, amount);
    if (!result.killed) return false;

    const { prunedAdjacency, components } = applyKillAndSplit(ast.adjacency, chunkId);

    const extracted = ast.extractDeadChunk(chunkId);
    if (extracted) {
      this.spawnDeadConfettiChunk(extracted, killerType);
      // Shards are a WEAPON-kill reward — the grinder is brute-force cleanup
      // and pays only the flat $1 cash, never Shards. This keeps weapons
      // strictly more valuable than letting cores drop into the blades.
      if (extracted.isCore && killerType !== 'grinder') {
        const shards = computeVaultShardReward(
          extracted.material,
          this.effectiveParams.shardYieldBonus,
          this.effectiveParams.shardYieldMultiplier,
        );
        if (shards > 0) {
          this.pendingShardsThisRun += shards;
          this.events.emit('pendingShardsChanged', this.pendingShardsThisRun, shards);
        }
      }
    }

    if (components.length >= 2) {
      const idx = this.liveAsteroids.indexOf(ast);
      if (idx >= 0) this.liveAsteroids.splice(idx, 1);
      const children = ast.split(components);
      this.liveAsteroids.push(...children);
    } else if (components.length === 1) {
      ast.setAdjacency(prunedAdjacency);
    } else {
      // Last chunk died — tear down and de-list now rather than waiting
      // for the next update() tick's isAlive guard to notice.
      const idx = this.liveAsteroids.indexOf(ast);
      if (idx >= 0) this.liveAsteroids.splice(idx, 1);
      ast.destroy();
    }

    return true;
  }

  private spawnDeadConfettiChunk(info: {
    worldX: number; worldY: number;
    velocityX: number; velocityY: number;
    material: Material; textureKey: string;
    isCore: boolean;
  }, killerType: WeaponKillSource): void {
    const chunk = this.matter.add.image(info.worldX, info.worldY, info.textureKey);
    chunk.setRectangle(CHUNK_PIXEL_SIZE, CHUNK_PIXEL_SIZE);
    chunk.setMass(0.25);
    // Space-like motion: dead chunks are slippery on surfaces (friction 0.02,
    // live chunks keep 0.1 so they pile + hinder) AND have zero air drag so
    // flung debris doesn't ghost-stall mid-air. Only gravity decelerates
    // vertical motion; horizontal glides run forever until they hit something.
    chunk.setFriction(0.02);
    chunk.setFrictionAir(0);
    chunk.setBounce(0);
    chunk.setVelocity(info.velocityX, info.velocityY);
    chunk.setAlpha(0.55);
    chunk.setScale(0.8);
    chunk.setData('kind', 'chunk');
    chunk.setData('dead', true);
    chunk.setData('tier', info.material.tier);
    chunk.setData('material', info.material);
    chunk.setData('isCore', info.isCore);
    chunk.setData('killerType', killerType);
    chunk.setCollisionCategory(CAT_DEAD_CHUNK);
    chunk.setCollidesWith(MASK_DEAD_CHUNK);
    this.deadChunks.add(chunk);
  }

  private collectDeadAtDeathLine(chunk: Phaser.Physics.Matter.Image): void {
    const tier = (chunk.getData('tier') as number | undefined) ?? 1;
    const killerType = (chunk.getData('killerType') as WeaponKillSource | undefined) ?? 'saw';
    const reward = computeChunkReward({
      tier,
      hpMultiplier: this.effectiveParams.maxHpPerChunk,
      killerType,
      cashMultiplier: this.effectiveParams.cashMultiplier,
    });
    gameplayState.addCash(reward);
    if (killerType === 'grinder') {
      this.cashFromLine += reward;
    } else {
      this.cashFromSaw += reward;
    }
    this.collectedDead++;
    this.spawnConfetti(chunk.x, chunk.y);
    this.deadChunks.delete(chunk);
    chunk.destroy();
  }

  // ── build ──────────────────────────────────────────────────────────────

  private buildArena(width: number, height: number): void {
    const wallT = 20;
    this.matter.add.rectangle(-wallT / 2, height / 2, wallT, height * 2, { isStatic: true });
    this.matter.add.rectangle(width + wallT / 2, height / 2, wallT, height * 2, { isStatic: true });
    // Death-line red strip removed — now that arena walls extend to the
    // screen edges, chunks can't leak horizontally, and the grinder row
    // itself is the visible floor.
  }

  private spawnWeaponInstance(typeId: string, x: number, y: number): WeaponInstance | null {
    const behavior = createBehavior(typeId);
    if (!behavior) return null;

    const id = `${typeId}-${this.nextInstanceId++}`;
    const sprite = this.matter.add.image(x, y, behavior.textureKey);
    sprite.setCircle(behavior.bodyRadius);
    sprite.setStatic(true);
    sprite.setDepth(1);
    sprite.setFriction(0.2);
    // Weapons are pinned to their slot in the procedural arena — no more
    // dragging. Interactive stays on so double-click (saw CW/CCW toggle)
    // and future slot-click interactions continue to fire.
    sprite.setInteractive();
    sprite.setData('kind', 'arbor');
    sprite.setData('instanceId', id);

    const instance: WeaponInstance = { id, type: typeId, sprite, behavior };
    this.weaponInstances.push(instance);

    if (behavior instanceof SawBehavior) this.wireSawDoubleClick(sprite, behavior);

    // Left-click a weapon → open that weapon type's upgrade subpanel.
    // Right-click a weapon → open the sell-confirm dialog.
    sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) {
        this.scene.get('ui').events.emit('open-sell-confirm', {
          slotId: this.slotIdForInstance(instance.id),
          typeId,
          instanceId: instance.id,
        });
        return;
      }
      this.scene.get('ui').events.emit('open-weapon-panel', typeId);
    });

    behavior.init(this, sprite, this.effectiveParams);
    return instance;
  }

  // The grinder is a fixed full-width entity, not a draggable weapon. One
  // instance per scene, created at scene start. Its `sprite` is a hidden
  // sensor satisfying the WeaponBehavior handle; the behavior manages the
  // real blade bodies internally.
  private spawnGrinder(sceneWidth: number): void {
    const behavior = new GrinderBehavior({
      deathLineY: DEATH_LINE_Y,
      channelCenterX: sceneWidth / 2,
    });
    behavior.createTextures(this);
    const id = `grinder-${this.nextInstanceId++}`;
    const hiddenSprite = this.matter.add.image(-9999, -9999, 'grinder-housing');
    hiddenSprite.setStatic(true);
    hiddenSprite.setSensor(true);
    hiddenSprite.setVisible(false);
    hiddenSprite.setData('kind', 'grinder-root');
    hiddenSprite.setData('instanceId', id);
    const instance: WeaponInstance = { id, type: 'grinder', sprite: hiddenSprite, behavior };
    this.weaponInstances.push(instance);
    behavior.init(this, hiddenSprite, this.effectiveParams);
  }

  // Double-click a saw arbor to reverse THIS saw's direction (each saw is
  // configured independently). Detects on pointerdown (not pointerup) so a
  // click that ALSO starts a drag still registers — the drag flag only
  // suppresses the NEXT pointerdown's toggle if a drag occurred between them.
  private slotIdForInstance(instanceId: string): string | null {
    for (const inst of gameplayState.allInstalls()) {
      if (inst.instanceId === instanceId) return inst.slotId;
    }
    return null;
  }

  sellWeaponAt(slotId: string): void {
    const installed = gameplayState.installedAt(slotId);
    if (!installed) return;
    const inst = this.weaponInstances.find((w) => w.id === installed.instanceId);
    if (!inst) return;
    inst.behavior.destroy();
    inst.sprite.destroy();
    this.weaponInstances = this.weaponInstances.filter((w) => w !== inst);
    gameplayState.uninstallWeapon(slotId);
    // Only refund cash if the count actually decremented. Prevents a $1
    // exploit when the count was already at the floor.
    if (gameplayState.sellWeapon(installed.typeId)) {
      gameplayState.addCash(1, { silent: true });
    }
    // Re-draw the slot marker so its yellow ring comes back.
    const slot = this.arenaLayout?.slots.find((s) => s.id === slotId);
    const g = this.slotMarkers.get(slotId);
    if (slot && g) this.redrawSlotMarker(g, slot);
  }

  private wireSawDoubleClick(sprite: Phaser.Physics.Matter.Image, saw: SawBehavior): void {
    let lastDown = 0;
    let draggedSinceLastDown = false;
    sprite.on('pointerdown', () => {
      const now = performance.now();
      if (now - lastDown < 400 && !draggedSinceLastDown) {
        saw.toggleClockwise();
        lastDown = 0;
      } else {
        lastDown = now;
      }
      draggedSinceLastDown = false;
    });
    sprite.on('dragstart', () => {
      draggedSinceLastDown = true;
    });
  }

  // Clear the persisted save and hard-reload. Detach the beforeunload handler
  /**
   * Bank pending shards, register prestige, wipe the run, and persist. Does
   * NOT restart the scene — UIScene keeps the prestige shop overlay open on
   * top of the reset run beneath, and the next Start Run re-enters fresh.
   */
  confirmPrestige(): void {
    if (this.pendingShardsThisRun > 0) {
      prestigeState.addShards(this.pendingShardsThisRun);
      this.pendingShardsThisRun = 0;
      this.events.emit('pendingShardsChanged', 0, 0);
    }
    prestigeState.registerPrestige();

    // Stop spawning while the prestige shop overlay is up — otherwise new
    // asteroids accumulate beneath the shop and their Matter bodies get
    // orphaned when startNewRun eventually restarts the scene.
    if (this.spawnTimer) {
      this.spawnTimer.remove(false);
      this.spawnTimer = null;
    }

    // Tear down weapons + asteroids before resetting counts (instance list
    // drives destroy loops; resetting counts first would orphan Matter bodies).
    for (const inst of this.weaponInstances) {
      inst.behavior.destroy();
      inst.sprite.destroy();
    }
    this.weaponInstances = [];
    for (const ast of this.liveAsteroids) ast.destroy();
    this.liveAsteroids = [];
    for (const d of this.deadChunks) d.destroy();
    this.deadChunks.clear();

    gameplayState.resetData();
    const defaults: Record<string, number> = {};
    for (const w of WEAPON_TYPES.filter((w) => !w.locked)) defaults[w.id] = w.startCount;
    gameplayState.initWeaponCounts(defaults);

    this.snapshotNow();
  }

  /** Seed the spawner and restart the scene with a clean slate. */
  startNewRun(seed: string): void {
    gameplayState.setRunSeed(seed);
    this.snapshotNow();
    // Re-hydrate the registry snapshot so create() picks up the new seed.
    const fresh = loadFromLocalStorage();
    this.game.registry.set('pendingSnapshot', fresh);
    // Phaser 3.90's `this.scene.restart()` does NOT re-run create() in this
    // project — observed empirically. stop+start cycles the scene and fires
    // create() correctly. Use game-level SceneManager, not `this.scene`,
    // because `this` is about to be invalidated.
    const mgr = this.game.scene;
    mgr.stop('game');
    mgr.start('game');
  }

  // first so snapshotNow() doesn't immediately re-write the slot we just cleared.
  restartGame(): void {
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
    }
    if (this.autosaveTimer) {
      this.autosaveTimer.remove(false);
      this.autosaveTimer = null;
    }
    clearSave();
    window.location.reload();
  }

  snapshotNow(): void {
    const weaponIds = WEAPON_TYPES.filter((w) => !w.locked).map((w) => w.id);
    const weaponCounts: Record<string, number> = {};
    for (const id of weaponIds) weaponCounts[id] = gameplayState.weaponCount(id);
    // Phase-4-TODO: populate weaponInstallations once arena slot binding lands.
    // During the transition, weapons are still free-floating (x,y) and we just
    // persist counts. allInstalls() is empty until installWeapon() is called.
    const installs = gameplayState.allInstalls().map((i) => ({
      slotId: i.slotId,
      typeId: i.typeId,
      instanceId: i.instanceId,
      clockwise: (() => {
        const w = this.weaponInstances.find((w) => w.id === i.instanceId);
        return w && w.behavior instanceof SawBehavior ? w.behavior.clockwise : undefined;
      })(),
    }));
    const snap: SaveStateV3 = {
      v: 3,
      cash: gameplayState.cash,
      levels: gameplayState.levels(),
      weaponCounts,
      weaponInstallations: installs,
      emaCashPerSec: this.rateTracker.rate(),
      savedAt: Date.now(),
      runSeed: gameplayState.runSeed,
      arenaSeed: this.arenaLayout?.seed ?? 0,
      arenaSlotsUnlocked: gameplayState.unlockedSlotIds() as string[],
      arenaFreeUnlockUsed: gameplayState.freeUnlockUsed,
      pendingShardsThisRun: this.pendingShardsThisRun,
      prestigeShards: prestigeState.shards,
      prestigeCount: prestigeState.prestigeCount,
      prestigeShopLevels: prestigeState.shopLevels() as Record<string, number>,
      instancesBoughtThisRun: gameplayState.allInstancesBoughtThisRun() as Record<string, number>,
    };
    saveToLocalStorage(snap);
  }

  private wireDrag(): void {
    // Weapons are pinned to slots now — no draggable behavior. Keep the 6px
    // dragDistanceThreshold so the saw double-click handler still fires
    // reliably against any residual sub-click pointer jitter.
    this.input.dragDistanceThreshold = 6;
  }

  // ── arena build ───────────────────────────────────────────────────────

  private buildArenaFromLayout(layout: ArenaLayout): void {
    for (const b of this.arenaWallBodies) this.matter.world.remove(b);
    for (const v of this.arenaWallVisuals) v.destroy();
    for (const b of this.screenEdgeWalls) this.matter.world.remove(b);
    this.arenaWallBodies = [];
    this.arenaWallVisuals = [];
    this.screenEdgeWalls = [];
    this.slotMarkers.forEach((g) => g.destroy());
    this.slotMarkers.clear();

    const w = layout.playfield.width;
    const h = layout.floorY;
    const t = WALL_COLLIDER_THICKNESS;
    // Left + right screen-edge walls; full column above floor, extending
    // slightly above the scene top so nothing escapes horizontally.
    this.screenEdgeWalls.push(
      this.matter.add.rectangle(-t / 2, h / 2, t, h * 2, { isStatic: true }),
      this.matter.add.rectangle(w + t / 2, h / 2, t, h * 2, { isStatic: true }),
    );

    for (const seg of layout.walls) {
      const cx = (seg.x1 + seg.x2) / 2;
      const cy = (seg.y1 + seg.y2) / 2;
      const len = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
      const angle = Math.atan2(seg.y2 - seg.y1, seg.x2 - seg.x1);
      const body = this.matter.add.rectangle(cx, cy, len, t, {
        isStatic: true,
        angle,
      });
      // Visual matches the collider thickness so "what you see = what blocks".
      const visual = this.add.rectangle(cx, cy, len, t, 0x3a3a4c).setRotation(angle);
      this.arenaWallBodies.push(body);
      this.arenaWallVisuals.push(visual);
    }

    for (const slot of layout.slots) {
      const g = this.add.graphics();
      this.redrawSlotMarker(g, slot);
      g.setInteractive(
        new Phaser.Geom.Circle(slot.x, slot.y, 26),
        Phaser.Geom.Circle.Contains,
      );
      g.on('pointerup', () => this.handleSlotClick(slot));
      this.slotMarkers.set(slot.id, g);
    }
  }

  private redrawSlotMarker(g: Phaser.GameObjects.Graphics, slot: SlotDef): void {
    g.clear();
    const installed = !!gameplayState.installedAt(slot.id);
    if (installed) return;
    const unlocked = gameplayState.isSlotUnlocked(slot.id);
    if (unlocked) {
      // "Buyable" ring — thick bright yellow + outer glow halo. Load-bearing
      // visual: every unlocked empty slot must read "click here to buy a
      // weapon" at a glance.
      g.fillStyle(0x3a3020, 0.45);
      g.fillCircle(slot.x, slot.y, 24);
      g.lineStyle(6, 0xffd166, 1);
      g.strokeCircle(slot.x, slot.y, 22);
      g.lineStyle(3, 0xffd166, 0.5);
      g.strokeCircle(slot.x, slot.y, 30);
    } else {
      g.fillStyle(0x2a2a34, 0.85);
      g.fillCircle(slot.x, slot.y, 18);
      g.lineStyle(3, 0x555568, 1);
      g.strokeCircle(slot.x, slot.y, 18);
      g.lineStyle(2, 0x888899, 1);
      g.beginPath();
      g.moveTo(slot.x - 4, slot.y - 2);
      g.lineTo(slot.x - 4, slot.y + 6);
      g.lineTo(slot.x + 4, slot.y + 6);
      g.lineTo(slot.x + 4, slot.y - 2);
      g.strokePath();
    }
  }

  private handleSlotClick(slot: SlotDef): void {
    if (!gameplayState.isSlotUnlocked(slot.id)) {
      const alreadyUnlocked = gameplayState.unlockedSlotIds().length;
      const start = this.startingUnlockedCountForThisRun();
      const extraUnlocked = Math.max(0, alreadyUnlocked - start);
      const isFreeUnlock = !gameplayState.freeUnlockUsed;
      // First unlock per run is free regardless of k. After that, cost is
      // floored at unlockCost(1) so a corrupted save (freeUnlockUsed=true
      // with extraUnlocked=0) can never leak a second free unlock.
      const cost = isFreeUnlock ? 0 : unlockCost(Math.max(1, extraUnlocked));
      if (gameplayState.tryUnlockSlot(slot.id, cost)) {
        if (isFreeUnlock) gameplayState.markFreeUnlockUsed();
        const g = this.slotMarkers.get(slot.id);
        if (g) this.redrawSlotMarker(g, slot);
      }
      return;
    }
    if (!gameplayState.installedAt(slot.id)) {
      this.scene.get('ui').events.emit('open-weapon-picker', {
        slotId: slot.id,
        x: slot.x,
        y: slot.y,
      });
    }
  }

  private startingUnlockedCountForThisRun(): number {
    const preLevel = prestigeState.shopLevels()['arena.preUnlockedSlots'] ?? 0;
    return startingUnlockedCount({
      preUnlockedLevel: preLevel,
      totalSlots: this.arenaLayout?.slots.length ?? 0,
    });
  }

  private applyStartingUnlocks(): void {
    if (!this.arenaLayout) return;
    const n = this.startingUnlockedCountForThisRun();
    const sorted = [...this.arenaLayout.slots].sort(
      (a, b) =>
        Math.hypot(a.x - this.scale.width / 2, a.y - this.scale.height / 2) -
        Math.hypot(b.x - this.scale.width / 2, b.y - this.scale.height / 2),
    );
    for (let i = 0; i < n && i < sorted.length; i++) {
      gameplayState.tryUnlockSlot(sorted[i].id, 0);
    }
  }

  toggleArenaDebugOverlay(): void {
    if (this.arenaDebugOverlay) {
      this.arenaDebugOverlay.destroy();
      this.arenaDebugOverlay = undefined;
      return;
    }
    if (!this.arenaLayout) return;
    const g = this.add.graphics();
    g.lineStyle(1, 0x00ff88, 0.6);
    for (const w of this.arenaLayout.walls) g.lineBetween(w.x1, w.y1, w.x2, w.y2);
    for (const s of this.arenaLayout.slots) g.strokeCircle(s.x, s.y, 22);
    g.setDepth(1000);
    this.arenaDebugOverlay = g;
  }

  private installWeaponAtSlot(slotId: string, typeId: string, x: number, y: number): void {
    if (gameplayState.installedAt(slotId)) return;
    const typeBought = gameplayState.instancesBoughtThisRun(typeId);
    const globalBought = gameplayState.totalInstancesBoughtThisRun();
    const freeSlotsForType = prestigeState.shopLevels()[`free.${typeId}`] ?? 0;
    const cost = weaponBuyCost({ globalBought, typeBought, freeSlotsForType });
    if (cost > 0 && !gameplayState.trySpend(cost)) return;
    const inst = this.spawnWeaponInstance(typeId, x, y);
    if (!inst) return;
    gameplayState.buyWeapon(typeId);
    gameplayState.installWeapon(slotId, typeId, inst.id);
  }

  private nextOscillatingSpawnX(): number {
    const w = this.scale.width;
    const maxAmplitude = Math.max(0, w / 2 - this.maxAsteroidRadius - SPAWN_MARGIN);
    // `spawn.amplitude` upgrade scales the sweep from L0=0.5 → L10=1.0.
    // Clamp in case prestige/future upgrades push multiplier past 1.0.
    const amplitude = maxAmplitude * Math.min(1, this.effectiveParams.spawnAmplitudeMultiplier);
    const x = w / 2 + amplitude * Math.sin(this.spawnPhase);
    this.spawnPhase += PHASE_STEP_RAD;
    return x;
  }

  private rebuildSpawnTimer(delayMs: number): void {
    this.spawnTimer?.remove();
    this.spawnTimer = this.time.addEvent({
      delay: delayMs,
      loop: true,
      callback: () => this.spawnAsteroid(),
    });
  }

  private buildHud(_width: number): void {
    // Always build the overlay text — visibility is gated on debugMode so
    // the options-menu toggle + backtick hotkey can flip it at runtime.
    this.debugText = this.add.text(28, this.scale.height - 216, '', {
      font: '22px ui-monospace',
      color: '#6cf',
      backgroundColor: '#0008',
      padding: { x: 12, y: 8 },
    });
    this.debugText.setVisible(this.debugMode);
    this.debugText.setDepth(900);

    if (this.input.keyboard) {
      this.debugKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.BACKTICK);
      this.debugKey.on('down', () => this.toggleDebugOverlay());
    }
  }

  toggleDebugOverlay(): void {
    this.debugMode = !this.debugMode;
    this.debugText?.setVisible(this.debugMode);
  }

  get debugEnabled(): boolean {
    return this.debugMode;
  }

  private wireCollisions(): void {
    this.collisionHandler = (event: Phaser.Physics.Matter.Events.CollisionStartEvent): void => {
      for (const pair of event.pairs) {
        this.handleContact(pair.bodyA, pair.bodyB);
      }
    };
    this.matter.world.on('collisionstart', this.collisionHandler);
    this.matter.world.on('collisionactive', this.collisionHandler);
  }

  // ── weapon count changes ──────────────────────────────────────────────

  private onWeaponCountChanged(typeId: string, newCount: number): void {
    const currentInstances = this.weaponInstances.filter((i) => i.type === typeId);
    if (newCount > currentInstances.length) {
      // Legacy path — in the procedural-arena world weapons are spawned via
      // the slot picker, not buyWeapon→count→spawn. If something bumps
      // weaponCount directly, drop a placeholder at the playfield center.
      const rx = this.scale.width / 2;
      const ry = CHANNEL_TOP_Y + 100;
      this.spawnWeaponInstance(typeId, rx, ry);
    } else if (newCount < currentInstances.length) {
      const idx = Math.floor(Math.random() * currentInstances.length);
      const victim = currentInstances[idx];
      victim.behavior.destroy();
      victim.sprite.destroy();
      this.weaponInstances = this.weaponInstances.filter((i) => i !== victim);
    }
  }

  // ── upgrades ──────────────────────────────────────────────────────────

  private recomputeEffectiveParams(): void {
    const prev = this.effectiveParams;
    this.effectiveParams = applyPrestigeEffects(applyUpgrades(gameplayState.levels()), prestigeState.shopLevels());

    for (const inst of this.weaponInstances) {
      inst.behavior.onUpgrade(this, inst.sprite, prev, this.effectiveParams);
    }
    // channelHalfWidth can no longer change mid-run (Channel Width upgrade
    // was removed in the procedural-arena work). Arena walls are built once
    // at scene create from the run seed's layout and never rebuilt from
    // upgrades.
    if (this.effectiveParams.spawnIntervalMs !== prev.spawnIntervalMs) {
      this.rebuildSpawnTimer(this.effectiveParams.spawnIntervalMs);
    }
    // fallSpeedMultiplier doesn't need a per-asteroid refresh: applyKinematicFall()
    // reads effectiveParams.fallSpeedMultiplier every tick, so upgrades take
    // effect immediately without touching individual bodies.
  }

  // ── gameplay ───────────────────────────────────────────────────────────

  private spawnAsteroid(): void {
    // Spawn gate: don't push a new asteroid in if the top of the channel is
    // already clogged. Keeps the pile from spilling above the channel when
    // the saw can't keep up with incoming flow (e.g. max Drop Rate + weak
    // damage). Skipped spawns are silently lost — gameplay incentive to buy
    // more / stronger weapons.
    const spawnGateY = CHANNEL_TOP_Y + 80;
    for (const ast of this.liveAsteroids) {
      for (const chunk of ast.chunks.values()) {
        if (chunk.bodyPart.position.y < spawnGateY) return;
      }
    }

    const spawnX = this.nextOscillatingSpawnX();
    const asteroid = this.spawner.spawnOne(spawnX, SPAWN_Y, {
      minChunks: this.effectiveParams.minChunks,
      maxChunks: this.effectiveParams.maxChunks,
      hpMultiplier: this.effectiveParams.maxHpPerChunk,
      qualityLevel: this.effectiveParams.qualityLevel,
      fallSpeedMultiplier: this.effectiveParams.fallSpeedMultiplier,
      fillerFraction: this.effectiveParams.fillerFraction,
    });
    this.liveAsteroids.push(asteroid);
    this.spawnedCount++;
    this.spawnedChunks += asteroid.chunks.size;
  }

  private handleContact(bodyA: MatterJS.BodyType, bodyB: MatterJS.BodyType): void {
    const pluginA = (bodyA as unknown as { plugin?: Partial<ChunkPartPlugin> }).plugin;
    const pluginB = (bodyB as unknown as { plugin?: Partial<ChunkPartPlugin> }).plugin;

    let chunkPart: MatterJS.BodyType | null = null;
    let otherPart: MatterJS.BodyType | null = null;
    let plugin: ChunkPartPlugin | null = null;

    if (pluginA?.kind === 'chunk' && pluginA.asteroid && pluginA.chunkId) {
      chunkPart = bodyA; otherPart = bodyB;
      plugin = pluginA as ChunkPartPlugin;
    } else if (pluginB?.kind === 'chunk' && pluginB.asteroid && pluginB.chunkId) {
      chunkPart = bodyB; otherPart = bodyA;
      plugin = pluginB as ChunkPartPlugin;
    }
    if (!chunkPart || !otherPart || !plugin) return;

    // Saw blades are created via matter.add.image so they have a gameObject
    // with Phaser data. Grinder blades are created via matter.add.rectangle
    // (no gameObject) and carry their routing via body.plugin instead.
    const goOther = (otherPart as { gameObject?: Phaser.GameObjects.GameObject }).gameObject;
    const pluginOther = (otherPart as unknown as { plugin?: { kind?: string; instanceId?: string } }).plugin;
    let otherKind: string | undefined;
    let instanceId: string | undefined;
    if (goOther) {
      otherKind = goOther.getData?.('kind') as string | undefined;
      instanceId = goOther.getData?.('instanceId') as string | undefined;
    } else if (pluginOther?.kind) {
      otherKind = pluginOther.kind;
      instanceId = pluginOther.instanceId;
    }
    if (otherKind !== 'saw' && otherKind !== 'grinder') return;
    if (!instanceId) return;
    const inst = this.weaponInstances.find((w) => w.id === instanceId);
    if (!inst?.behavior.handleCompoundHit) return;

    const result = inst.behavior.handleCompoundHit(
      plugin.asteroid, plugin.chunkId, otherPart, this.effectiveParams, this,
    );
    if (result.hit) {
      this.weaponHits++;
      if (result.killed) this.killedBySaw++;
    }
  }

  // ── juice ──────────────────────────────────────────────────────────────

  private spawnConfetti(x: number, y: number): void {
    for (let i = 0; i < 10; i++) {
      const c = this.add.rectangle(
        x, y,
        3 + Math.random() * 2, 3 + Math.random() * 2,
        Phaser.Display.Color.RandomRGB().color,
      );
      const vx = (Math.random() - 0.5) * 260;
      const vy = -80 - Math.random() * 140;
      this.tweens.add({
        targets: c, x: x + vx, y: y + vy + 180, alpha: 0,
        angle: Math.random() * 360, duration: 680,
        onComplete: () => c.destroy(),
      });
    }
  }

  // ── procedural textures ────────────────────────────────────────────────

  private makeChunkTextures(): void {
    for (const material of MATERIALS) {
      this.drawMaterialTexture(material);
    }
  }

  private drawMaterialTexture(material: Material): void {
    const size = CHUNK_PIXEL_SIZE;
    const key = textureKeyFor(material);
    if (material.hasGlow) {
      const pad = 3;
      const total = size + pad * 2;
      const ct = this.textures.createCanvas(key, total, total);
      if (!ct) return;
      const ctx = ct.getContext();
      const grad = ctx.createRadialGradient(total / 2, total / 2, size * 0.1, total / 2, total / 2, total / 2);
      grad.addColorStop(0, material.glowColor);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, total, total);
      this.drawChunkBody(ctx, pad, pad, size, material);
      ct.refresh();
      return;
    }
    const ct = this.textures.createCanvas(key, size, size);
    if (!ct) return;
    const ctx = ct.getContext();
    this.drawChunkBody(ctx, 0, 0, size, material);
    ct.refresh();
  }

  private drawChunkBody(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, size: number,
    material: Material,
  ): void {
    const grad = ctx.createLinearGradient(x, y, x + size, y + size);
    grad.addColorStop(0, material.fillColors[0]);
    grad.addColorStop(0.5, material.fillColors[1]);
    grad.addColorStop(1, material.fillColors[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, size, size);

    ctx.strokeStyle = material.borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);

    if (material.band !== 'earth') {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(x + 1, y + 1, 1, 1);
    }
  }
}
