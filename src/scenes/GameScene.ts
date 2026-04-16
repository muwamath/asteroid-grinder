import Phaser from 'phaser';
import type { Asteroid } from '../game/asteroid';
import { CHUNK_PIXEL_SIZE } from '../game/asteroid';
import { AsteroidSpawner } from '../game/asteroidSpawner';
import { gameplayState } from '../game/gameplayState';
import { BASE_PARAMS, applyUpgrades, type EffectiveGameplayParams } from '../game/upgradeApplier';
import { WEAPON_TYPES } from '../game/weaponCatalog';
import { type WeaponBehavior, createBehavior, allBehaviorPrototypes } from '../game/weapons';
import { MATERIALS, type Material, textureKeyFor } from '../game/materials';

const ARBOR_RADIUS = 20;

// Hard barrier enforcement — pushes alive chunks out of weapon collision
// zones every frame so pile pressure can't defeat the physics solver.
const CHUNK_HALF = CHUNK_PIXEL_SIZE * 0.5;
const BARRIER_BUFFER = 1;

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
  private chunkImages = new Set<Phaser.Physics.Matter.Image>();

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

    this.spawner = new AsteroidSpawner(this, this.chunkImages);
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
    // Update all weapons generically.
    for (const inst of this.weaponInstances) {
      inst.behavior.update(this, inst.sprite, delta, this.chunkImages, this.effectiveParams);
    }

    this.enforceWeaponBarriers();

    for (const chunk of this.chunkImages) {
      if (!chunk.active) {
        this.chunkImages.delete(chunk);
        continue;
      }
      if (chunk.y > DEATH_LINE_Y) {
        this.collectAtDeathLine(chunk);
      } else if (chunk.y > this.scale.height + 120) {
        this.chunkImages.delete(chunk);
        chunk.destroy();
      }
    }

    if (this.debugMode && this.debugText) {
      const fps = Math.round(this.game.loop.actualFps);
      const world = this.matter.world.localWorld as unknown as { bodies: unknown[] };
      const bodies = world.bodies.length;
      this.debugText.setText(
        [
          `FPS ${fps}  ·  bodies ${bodies}  ·  live chunks ${this.chunkImages.size}`,
          `spawned ${this.spawnedCount} asteroids · ${this.spawnedChunks} chunks`,
          `hits ${this.weaponHits}  ·  killed ${this.killedBySaw}`,
          `collected dead ${this.collectedDead}  ·  collected alive ${this.collectedAlive}`,
          `cash ledger $${gameplayState.cash} (saw $${this.cashFromSaw} + line $${this.cashFromLine})`,
          `weapons ${this.weaponInstances.length}  ·  dmg ${this.effectiveParams.sawDamage}  ·  spawn ${this.effectiveParams.spawnIntervalMs}ms`,
        ].join('\n'),
      );
    }
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
  }

  // ── gameplay ───────────────────────────────────────────────────────────

  private spawnAsteroid(): void {
    const beforeSize = this.chunkImages.size;
    const halfW = this.scale.width / 2;
    const jitter = (Math.random() - 0.5) * (this.effectiveParams.channelHalfWidth * 0.6);
    this.spawner.spawnOne(halfW + jitter, SPAWN_Y, {
      minChunks: this.effectiveParams.minChunks,
      maxChunks: this.effectiveParams.maxChunks,
      maxHpPerChunk: this.effectiveParams.maxHpPerChunk,
    });
    this.spawnedCount++;
    this.spawnedChunks += this.chunkImages.size - beforeSize;
  }

  private handleContact(bodyA: MatterJS.BodyType, bodyB: MatterJS.BodyType): void {
    const goA = (bodyA as { gameObject?: Phaser.GameObjects.GameObject }).gameObject;
    const goB = (bodyB as { gameObject?: Phaser.GameObjects.GameObject }).gameObject;
    if (!goA || !goB) return;

    let chunk: Phaser.Physics.Matter.Image | null = null;
    let blade: Phaser.Physics.Matter.Image | null = null;

    if (goA.getData('kind') === 'saw' && goB.getData('kind') === 'chunk') {
      blade = goA as Phaser.Physics.Matter.Image;
      chunk = goB as Phaser.Physics.Matter.Image;
    } else if (goB.getData('kind') === 'saw' && goA.getData('kind') === 'chunk') {
      blade = goB as Phaser.Physics.Matter.Image;
      chunk = goA as Phaser.Physics.Matter.Image;
    }

    if (!chunk || !blade) return;

    // Delegate to the saw behavior that owns these blades.
    for (const inst of this.weaponInstances) {
      if (inst.behavior.handleCollision) {
        const result = inst.behavior.handleCollision(chunk, blade, this.effectiveParams, this);
        if (result.hit) {
          this.weaponHits++;
          if (result.killed) this.killedBySaw++;
        }
        break;
      }
    }
  }

  /** Push alive chunks out of weapon collision zones AND channel walls. */
  private enforceWeaponBarriers(): void {
    const halfW = this.scale.width / 2;
    const halfCh = this.effectiveParams.channelHalfWidth;
    const wallLeft = halfW - halfCh;
    const wallRight = halfW + halfCh;

    for (const chunk of this.chunkImages) {
      if (!chunk.active || chunk.getData('dead')) continue;

      // ── channel walls ──
      const minX = wallLeft + CHUNK_HALF + BARRIER_BUFFER;
      const maxX = wallRight - CHUNK_HALF - BARRIER_BUFFER;
      if (chunk.x < minX) {
        chunk.setPosition(minX, chunk.y);
        const body = chunk.body as MatterJS.BodyType;
        if (body.velocity.x < 0) chunk.setVelocityX(0);
      } else if (chunk.x > maxX) {
        chunk.setPosition(maxX, chunk.y);
        const body = chunk.body as MatterJS.BodyType;
        if (body.velocity.x > 0) chunk.setVelocityX(0);
      }

      // ── weapon bodies ──
      for (const inst of this.weaponInstances) {
        if (!inst.behavior.blocksChunks) continue;
        this.pushOutOfCircle(chunk, inst.sprite.x, inst.sprite.y,
          inst.behavior.bodyRadius + CHUNK_HALF + BARRIER_BUFFER);
        // Extra barrier bodies (e.g. saw blades).
        const extras = inst.behavior.getBarrierBodies?.() ?? [];
        for (const b of extras) {
          this.pushOutOfCircle(chunk, b.x, b.y, b.radius + CHUNK_HALF + BARRIER_BUFFER);
        }
      }
    }
  }

  private pushOutOfCircle(
    chunk: Phaser.Physics.Matter.Image,
    cx: number,
    cy: number,
    minDist: number,
  ): void {
    const dx = chunk.x - cx;
    const dy = chunk.y - cy;
    const distSq = dx * dx + dy * dy;
    if (distSq >= minDist * minDist) return;

    const dist = Math.sqrt(distSq);
    if (dist < 0.1) {
      chunk.setPosition(cx, cy - minDist);
      chunk.setVelocityY(0);
      return;
    }

    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = minDist - dist;
    chunk.setPosition(chunk.x + nx * overlap, chunk.y + ny * overlap);

    const body = chunk.body as MatterJS.BodyType;
    const vDot = body.velocity.x * nx + body.velocity.y * ny;
    if (vDot < 0) {
      chunk.setVelocity(
        body.velocity.x - vDot * nx,
        body.velocity.y - vDot * ny,
      );
    }
  }

  private collectAtDeathLine(chunk: Phaser.Physics.Matter.Image): void {
    const asteroid = chunk.getData('asteroid') as Asteroid | undefined;
    const dead = chunk.getData('dead') as boolean;

    if (!dead && asteroid) {
      asteroid.damageChunkByImage(chunk, Number.POSITIVE_INFINITY);
    }

    if (dead) {
      const maxHp = (chunk.getData('maxHp') as number) ?? 1;
      const amount = Math.max(1, maxHp * 2);
      gameplayState.addCash(amount);
      this.cashFromSaw += amount;
      this.collectedDead++;
      this.spawnConfetti(chunk.x, chunk.y);
    } else {
      gameplayState.addCash(1);
      this.cashFromLine += 1;
      this.collectedAlive++;
    }

    this.chunkImages.delete(chunk);
    chunk.destroy();
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
