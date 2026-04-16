import Phaser from 'phaser';
import { CompoundAsteroid, CHUNK_PIXEL_SIZE } from '../game/compoundAsteroid';
import { AsteroidSpawner } from '../game/asteroidSpawner';
import { gameplayState } from '../game/gameplayState';
import { BASE_PARAMS, applyUpgrades, type EffectiveGameplayParams } from '../game/upgradeApplier';
import { WEAPON_TYPES } from '../game/weaponCatalog';
import { type WeaponBehavior, createBehavior, allBehaviorPrototypes } from '../game/weapons';
import { MATERIALS, type Material, textureKeyFor } from '../game/materials';
import type { ChunkTarget } from '../game/chunkTarget';
import { applyKillAndSplit } from '../game/asteroidGraph';

const ARBOR_RADIUS = 20;

const SPAWN_Y = -80;
const DEATH_LINE_Y = 652;

const CHANNEL_WALL_THICKNESS = 12;
const CHANNEL_TOP_Y = 80;

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
    this.effectiveParams = applyUpgrades(gameplayState.levels());

    const { width, height } = this.scale;

    this.buildArena(width, height);
    this.rebuildChannelWalls(this.effectiveParams.channelHalfWidth);
    this.buildHud(width);
    this.wireCollisions();
    this.wireDrag();

    // Spawn initial weapon instances, spaced out vertically.
    const unlocked = WEAPON_TYPES.filter((w) => !w.locked && w.id !== 'grinder');
    const yBottom = DEATH_LINE_Y - ARBOR_RADIUS - 10;
    const ySpacing = ARBOR_RADIUS * 3;
    for (let wi = 0; wi < unlocked.length; wi++) {
      const wt = unlocked[wi];
      const spawnY = yBottom - wi * ySpacing;
      for (let i = 0; i < wt.startCount; i++) {
        this.spawnWeaponInstance(wt.id, width / 2, spawnY);
      }
    }
    gameplayState.initWeaponCounts(
      Object.fromEntries(WEAPON_TYPES.filter((w) => !w.locked).map((w) => [w.id, w.startCount])),
    );

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
      for (const inst of this.weaponInstances) {
        inst.behavior.destroy();
        inst.sprite.destroy();
      }
      this.weaponInstances = [];
    });

    this.scene.launch('ui');
  }

  update(_time: number, delta: number): void {
    // Weapons run first; Task 9 switches them to ChunkTarget[]. For now
    // we still pass an empty set — laser/missile/blackhole will no-op and
    // the saw path fires via the collision handler in Task 8.
    void this.buildChunkTargets; // reserved for Task 9
    const emptyChunks = new Set<Phaser.Physics.Matter.Image>();
    for (const inst of this.weaponInstances) {
      inst.behavior.update(this, inst.sprite, delta, emptyChunks, this.effectiveParams);
    }

    const maxY = this.scale.height + 120;
    const fall = this.effectiveParams.fallSpeedMultiplier;

    for (let i = this.liveAsteroids.length - 1; i >= 0; i--) {
      const ast = this.liveAsteroids[i];
      if (!ast.isAlive) {
        ast.destroy();
        this.liveAsteroids.splice(i, 1);
        continue;
      }
      ast.applyKinematicFall(fall);
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
      this.debugText.setText(
        [
          `FPS ${fps}  ·  bodies ${bodies}  ·  asteroids ${this.liveAsteroids.length}  ·  live ${liveChunkCount}  ·  dead ${this.deadChunks.size}`,
          `spawned ${this.spawnedCount} asteroids · ${this.spawnedChunks} chunks`,
          `hits ${this.weaponHits}  ·  killed ${this.killedBySaw}`,
          `collected dead ${this.collectedDead}  ·  collected alive ${this.collectedAlive}`,
          `cash $${gameplayState.cash} (saw $${this.cashFromSaw} + line $${this.cashFromLine})`,
          `weapons ${this.weaponInstances.length}  ·  dmg ${this.effectiveParams.sawDamage}  ·  spawn ${this.effectiveParams.spawnIntervalMs}ms`,
        ].join('\n'),
      );
    }
  }

  private buildChunkTargets(): ChunkTarget[] {
    const targets: ChunkTarget[] = [];
    for (const ast of this.liveAsteroids) {
      for (const chunk of ast.chunks.values()) {
        const pos = chunk.bodyPart.position;
        targets.push({
          x: pos.x, y: pos.y, dead: false, tier: chunk.material.tier,
          damage: (amount) => this.damageLiveChunk(ast, chunk.chunkId, amount),
        });
      }
    }
    for (const dead of this.deadChunks) {
      if (!dead.active) continue;
      const tier = (dead.getData('tier') as number | undefined) ?? 1;
      targets.push({
        x: dead.x, y: dead.y, dead: true, tier,
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

    this.add.rectangle(width / 2, DEATH_LINE_Y, width, 3, 0xff3355, 0.9).setOrigin(0.5);
    this.add
      .text(width - 12, DEATH_LINE_Y - 18, 'DEATH LINE', {
        font: '11px ui-monospace',
        color: '#ff6680',
      })
      .setOrigin(1, 1);
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

    behavior.init(this, sprite, this.effectiveParams);
    return instance;
  }

  private wireDrag(): void {
    this.dragHandler = (
      _pointer: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject, dragX: number, dragY: number,
    ) => {
        const inst = this.weaponInstances.find((w) => w.sprite === obj);
        if (!inst) return;
        const halfW = this.scale.width / 2;
        const halfChannel = this.effectiveParams.channelHalfWidth;
        const r = inst.behavior.bodyRadius;
        const minX = halfW - halfChannel + r + 4;
        const maxX = halfW + halfChannel - r - 4;
        const cx = Phaser.Math.Clamp(dragX, minX, maxX);
        const cy = Phaser.Math.Clamp(dragY, CHANNEL_TOP_Y + r + 4, DEATH_LINE_Y - r - 4);
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
    const leftWallX = width / 2 - halfWidth - CHANNEL_WALL_THICKNESS / 2;
    const rightWallX = width / 2 + halfWidth + CHANNEL_WALL_THICKNESS / 2;

    this.channelLeftBody = this.matter.add.rectangle(
      leftWallX, channelMidY, CHANNEL_WALL_THICKNESS, channelHeight, { isStatic: true },
    );
    this.channelRightBody = this.matter.add.rectangle(
      rightWallX, channelMidY, CHANNEL_WALL_THICKNESS, channelHeight, { isStatic: true },
    );
    this.channelLeftVisual = this.add
      .rectangle(leftWallX, channelMidY, CHANNEL_WALL_THICKNESS, channelHeight, 0x3a3a4c)
      .setOrigin(0.5);
    this.channelRightVisual = this.add
      .rectangle(rightWallX, channelMidY, CHANNEL_WALL_THICKNESS, channelHeight, 0x3a3a4c)
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
    if (this.debugMode) {
      this.debugText = this.add.text(14, this.scale.height - 92, '', {
        font: '11px ui-monospace',
        color: '#6cf',
        backgroundColor: '#0008',
        padding: { x: 6, y: 4 },
      });
    }
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

  /**
   * Stubbed until Task 8 rewrites it against plugin-based part routing.
   * Collision wiring in wireCollisions still points at this method so the
   * collisionstart/active listeners don't throw.
   */
  private handleContact(_bodyA: MatterJS.BodyType, _bodyB: MatterJS.BodyType): void {
    // no-op during mid-refactor
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
