import Phaser from 'phaser';
import { CompoundAsteroid, CHUNK_PIXEL_SIZE } from '../game/compoundAsteroid';
import { AsteroidSpawner } from '../game/asteroidSpawner';
import { gameplayState } from '../game/gameplayState';
import { BASE_PARAMS, applyUpgrades, type EffectiveGameplayParams } from '../game/upgradeApplier';
import { WEAPON_TYPES } from '../game/weaponCatalog';
import { CashRateTracker } from '../game/cashRate';
import { saveToLocalStorage, clearSave, type SaveStateV1 } from '../game/saveState';
import { type WeaponBehavior, createBehavior, allBehaviorPrototypes } from '../game/weapons';
import { SawBehavior } from '../game/weapons/sawBehavior';
import { MATERIALS, type Material, textureKeyFor } from '../game/materials';
import type { ChunkTarget } from '../game/chunkTarget';
import type { ChunkPartPlugin } from '../game/compoundAsteroid';
import { applyKillAndSplit } from '../game/asteroidGraph';

const ARBOR_RADIUS = 12;

const SPAWN_Y = -80;
const DEATH_LINE_Y = 1304;

const CHANNEL_WALL_THICKNESS = 12;
// The Matter collision body is thicker than the visual rectangle. Deep
// piles of compound asteroids can penetrate a thin static wall because the
// solver has limited correction range. Giving the collider extra depth
// outside the channel face fixes this without changing visuals.
const CHANNEL_WALL_COLLIDER_THICKNESS = 40;
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

  private spawner!: AsteroidSpawner;
  private liveAsteroids: CompoundAsteroid[] = [];
  private deadChunks = new Set<Phaser.Physics.Matter.Image>();

  private effectiveParams: EffectiveGameplayParams = BASE_PARAMS;
  private spawnTimer: Phaser.Time.TimerEvent | null = null;

  private channelLeftBody: MatterJS.BodyType | null = null;
  private channelRightBody: MatterJS.BodyType | null = null;
  private channelLeftVisual: Phaser.GameObjects.Rectangle | null = null;
  private channelRightVisual: Phaser.GameObjects.Rectangle | null = null;

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

  preload(): void {
    this.makeChunkTextures();
    // Let each weapon behavior generate its own textures.
    for (const proto of allBehaviorPrototypes()) {
      proto.createTextures(this);
    }
  }

  create(): void {
    gameplayState.resetData();

    const snap = this.game.registry.get('pendingSnapshot') as SaveStateV1 | null;
    if (snap) {
      gameplayState.loadSnapshot({
        cash: snap.cash,
        levels: snap.levels,
        weaponCounts: snap.weaponCounts,
      });
      this.rateTracker = new CashRateTracker(60_000, snap.emaCashPerSec);
      // Consume once — a future scene restart should NOT re-apply.
      this.game.registry.set('pendingSnapshot', null);
    } else {
      this.rateTracker = new CashRateTracker(60_000, 0);
    }
    this.lastEarnedAt = this.time.now;

    this.effectiveParams = applyUpgrades(gameplayState.levels());

    const { width, height } = this.scale;

    this.buildArena(width, height);
    this.rebuildChannelWalls(this.effectiveParams.channelHalfWidth);
    this.buildHud(width);
    this.wireCollisions();
    this.wireDrag();

    // Spawn initial weapon instances. Priority:
    //   1) Saved per-instance positions (from snapshot) — restores drag state.
    //   2) Saved counts (legacy snapshot) — stacked default positions.
    //   3) Fresh game — catalog startCount at stacked defaults.
    const unlocked = WEAPON_TYPES.filter((w) => !w.locked && w.id !== 'grinder');
    const yBottom = DEATH_LINE_Y - ARBOR_RADIUS - 10;
    const ySpacing = ARBOR_RADIUS * 3;
    if (snap && snap.weaponInstances.length > 0) {
      for (const si of snap.weaponInstances) {
        const inst = this.spawnWeaponInstance(si.typeId, si.x, si.y);
        if (inst && inst.behavior instanceof SawBehavior && si.clockwise === false) {
          inst.behavior.setClockwise(false);
        }
      }
    } else {
      for (let wi = 0; wi < unlocked.length; wi++) {
        const wt = unlocked[wi];
        const spawnY = yBottom - wi * ySpacing;
        const count = snap ? (snap.weaponCounts[wt.id] ?? 0) : wt.startCount;
        for (let i = 0; i < count; i++) {
          this.spawnWeaponInstance(wt.id, width / 2, spawnY);
        }
      }
    }
    if (!snap) {
      gameplayState.initWeaponCounts(
        Object.fromEntries(WEAPON_TYPES.filter((w) => !w.locked).map((w) => [w.id, w.startCount])),
      );
    }

    this.spawner = new AsteroidSpawner(this);
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
      if (this.collisionHandler) {
        this.matter.world.off('collisionstart', this.collisionHandler);
        this.matter.world.off('collisionactive', this.collisionHandler);
        this.collisionHandler = null;
      }
      if (this.dragHandler) {
        this.input.off(Phaser.Input.Events.DRAG, this.dragHandler);
        this.dragHandler = null;
      }
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

    // Channel wall inner faces — kinematic barrier safety net below.
    const halfW = this.scale.width / 2;
    const halfCh = this.effectiveParams.channelHalfWidth;
    const wallInnerL = halfW - halfCh;
    const wallInnerR = halfW + halfCh;

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

      // Grinder line: any chunk part below DEATH_LINE_Y gets chewed.
      // Snapshot IDs first — damageLiveChunk may split the asteroid.
      const toGrind: string[] = [];
      for (const chunk of ast.chunks.values()) {
        if (chunk.bodyPart.position.y > DEATH_LINE_Y) toGrind.push(chunk.chunkId);
      }
      for (const id of toGrind) {
        const killed = this.damageLiveChunk(ast, id, Number.POSITIVE_INFINITY);
        if (killed) {
          gameplayState.addCash(1);
          this.cashFromLine += 1;
          this.collectedAlive++;
        }
      }

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
          damage: (amount) => this.damageLiveChunk(ast, chunkId, amount),
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
        damage: () => false,
      });
    }
    return targets;
  }

  damageLiveChunk(ast: CompoundAsteroid, chunkId: string, amount: number): boolean {
    const result = ast.damageChunk(chunkId, amount);
    if (!result.killed) return false;

    const { prunedAdjacency, components } = applyKillAndSplit(ast.adjacency, chunkId);

    const extracted = ast.extractDeadChunk(chunkId);
    if (extracted) this.spawnDeadConfettiChunk(extracted);

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
  }): void {
    const chunk = this.matter.add.image(info.worldX, info.worldY, info.textureKey);
    chunk.setRectangle(CHUNK_PIXEL_SIZE, CHUNK_PIXEL_SIZE);
    chunk.setMass(0.25);
    chunk.setFriction(0.1);
    chunk.setFrictionAir(0.005);
    chunk.setBounce(0);
    chunk.setVelocity(info.velocityX, info.velocityY);
    chunk.setAlpha(0.55);
    chunk.setScale(0.8);
    chunk.setData('kind', 'chunk');
    chunk.setData('dead', true);
    chunk.setData('tier', info.material.tier);
    chunk.setData('material', info.material);
    chunk.setData('isCore', info.isCore);
    this.deadChunks.add(chunk);
  }

  private collectDeadAtDeathLine(chunk: Phaser.Physics.Matter.Image): void {
    const tier = (chunk.getData('tier') as number | undefined) ?? 1;
    gameplayState.addCash(tier);
    this.cashFromSaw += tier;
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

    this.add.rectangle(width / 2, DEATH_LINE_Y, width, 6, 0xff3355, 0.9).setOrigin(0.5);
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
    sprite.setInteractive({ draggable: true });
    this.input.setDraggable(sprite);
    sprite.setData('kind', 'arbor');
    sprite.setData('instanceId', id);

    const instance: WeaponInstance = { id, type: typeId, sprite, behavior };
    this.weaponInstances.push(instance);

    if (behavior instanceof SawBehavior) this.wireSawDoubleClick(sprite, behavior);

    behavior.init(this, sprite, this.effectiveParams);
    return instance;
  }

  // Double-click a saw arbor to reverse THIS saw's direction (each saw is
  // configured independently). Detects on pointerdown (not pointerup) so a
  // click that ALSO starts a drag still registers — the drag flag only
  // suppresses the NEXT pointerdown's toggle if a drag occurred between them.
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
    const weaponInstances = this.weaponInstances.map((inst) => {
      const base: { typeId: string; x: number; y: number; clockwise?: boolean } = {
        typeId: inst.type,
        x: inst.sprite.x,
        y: inst.sprite.y,
      };
      if (inst.behavior instanceof SawBehavior) base.clockwise = inst.behavior.clockwise;
      return base;
    });
    const snap: SaveStateV1 = {
      v: 1,
      cash: gameplayState.cash,
      levels: gameplayState.levels(),
      weaponCounts,
      weaponInstances,
      emaCashPerSec: this.rateTracker.rate(),
      savedAt: Date.now(),
    };
    saveToLocalStorage(snap);
  }

  private wireDrag(): void {
    // Require ≥6px movement before a press counts as a drag. Without this
    // the default threshold (0) makes any 1-2px mouse jitter on a click
    // start a drag, which suppresses the double-click handler on the arbor.
    this.input.dragDistanceThreshold = 6;
    this.dragHandler = (
      _pointer: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject, dragX: number, dragY: number,
    ) => {
        const inst = this.weaponInstances.find((w) => w.sprite === obj);
        if (!inst) return;
        const halfW = this.scale.width / 2;
        const halfChannel = this.effectiveParams.channelHalfWidth;
        const r = inst.behavior.bodyRadius;
        const minX = halfW - halfChannel + r + 8;
        const maxX = halfW + halfChannel - r - 8;
        const cx = Phaser.Math.Clamp(dragX, minX, maxX);
        const cy = Phaser.Math.Clamp(dragY, CHANNEL_TOP_Y + r + 8, DEATH_LINE_Y - r - 8);
        inst.sprite.setPosition(cx, cy);
    };
    this.input.on(Phaser.Input.Events.DRAG, this.dragHandler);
  }

  private rebuildChannelWalls(halfWidth: number): void {
    if (this.channelLeftBody) this.matter.world.remove(this.channelLeftBody);
    if (this.channelRightBody) this.matter.world.remove(this.channelRightBody);
    this.channelLeftVisual?.destroy();
    this.channelRightVisual?.destroy();

    const width = this.scale.width;
    const channelHeight = DEATH_LINE_Y - CHANNEL_TOP_Y;
    const channelMidY = CHANNEL_TOP_Y + channelHeight / 2;
    // Visual rectangle face is at (halfWidth ± 0) from center; visual
    // collider is offset so its INNER face matches the visual inner face,
    // with its extra thickness extending OUTWARD (away from the channel).
    const visualLeftX = width / 2 - halfWidth - CHANNEL_WALL_THICKNESS / 2;
    const visualRightX = width / 2 + halfWidth + CHANNEL_WALL_THICKNESS / 2;
    const colliderLeftX = width / 2 - halfWidth - CHANNEL_WALL_COLLIDER_THICKNESS / 2;
    const colliderRightX = width / 2 + halfWidth + CHANNEL_WALL_COLLIDER_THICKNESS / 2;

    this.channelLeftBody = this.matter.add.rectangle(
      colliderLeftX, channelMidY, CHANNEL_WALL_COLLIDER_THICKNESS, channelHeight,
      { isStatic: true },
    );
    this.channelRightBody = this.matter.add.rectangle(
      colliderRightX, channelMidY, CHANNEL_WALL_COLLIDER_THICKNESS, channelHeight,
      { isStatic: true },
    );
    this.channelLeftVisual = this.add
      .rectangle(visualLeftX, channelMidY, CHANNEL_WALL_THICKNESS, channelHeight, 0x3a3a4c)
      .setOrigin(0.5);
    this.channelRightVisual = this.add
      .rectangle(visualRightX, channelMidY, CHANNEL_WALL_THICKNESS, channelHeight, 0x3a3a4c)
      .setOrigin(0.5);

    const halfW = this.scale.width / 2;
    for (const inst of this.weaponInstances) {
      const r = inst.behavior.bodyRadius;
      inst.sprite.setPosition(
        Phaser.Math.Clamp(inst.sprite.x, halfW - halfWidth + r + 4, halfW + halfWidth - r - 4),
        inst.sprite.y,
      );
    }
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
      const halfW = this.scale.width / 2;
      const halfChannel = this.effectiveParams.channelHalfWidth;
      const rx = halfW + (Math.random() - 0.5) * halfChannel;
      const ry = CHANNEL_TOP_Y + 100 + Math.random() * (DEATH_LINE_Y - CHANNEL_TOP_Y - 200);
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
    this.effectiveParams = applyUpgrades(gameplayState.levels());

    for (const inst of this.weaponInstances) {
      inst.behavior.onUpgrade(this, inst.sprite, prev, this.effectiveParams);
    }
    if (this.effectiveParams.channelHalfWidth !== prev.channelHalfWidth) {
      this.rebuildChannelWalls(this.effectiveParams.channelHalfWidth);
    }
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

    const halfW = this.scale.width / 2;
    const jitter = (Math.random() - 0.5) * (this.effectiveParams.channelHalfWidth * 0.6);
    const asteroid = this.spawner.spawnOne(halfW + jitter, SPAWN_Y, {
      minChunks: this.effectiveParams.minChunks,
      maxChunks: this.effectiveParams.maxChunks,
      hpMultiplier: this.effectiveParams.maxHpPerChunk,
      qualityLevel: this.effectiveParams.qualityLevel,
      fallSpeedMultiplier: this.effectiveParams.fallSpeedMultiplier,
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

    const goOther = (otherPart as { gameObject?: Phaser.GameObjects.GameObject }).gameObject;
    const otherKind = goOther?.getData?.('kind') as string | undefined;
    if (otherKind !== 'saw') return;

    // Route the hit to the owning weapon instance — blades carry their
    // arbor's instanceId. Without this match, multi-saw setups would
    // drive every hit into the first instance's cooldown + stats.
    const instanceId = goOther?.getData?.('instanceId') as string | undefined;
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
