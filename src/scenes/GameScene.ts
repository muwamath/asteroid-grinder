import Phaser from 'phaser';
import type { Asteroid } from '../game/asteroid';
import { CHUNK_PIXEL_SIZE } from '../game/asteroid';
import { AsteroidSpawner } from '../game/asteroidSpawner';
import { gameplayState } from '../game/gameplayState';
import { BASE_PARAMS, applyUpgrades, type EffectiveGameplayParams } from '../game/upgradeApplier';

const STOPPER_RADIUS = 32;
const SAW_ORBIT_RADIUS = 56;
const SAW_ORBIT_RAD_PER_SEC = 4;
const SAW_RADIUS = 18;
const SAW_HIT_COOLDOWN_MS = 120;

const SPAWN_Y = -80;
const DEATH_LINE_Y = 580;

const CHANNEL_WALL_THICKNESS = 12;
const CHANNEL_TOP_Y = 80;

export class GameScene extends Phaser.Scene {
  private stopper!: Phaser.Physics.Matter.Image;
  private sawBlades: Phaser.Physics.Matter.Image[] = [];
  private sawAngle = 0;

  private spawner!: AsteroidSpawner;
  private chunkImages = new Set<Phaser.Physics.Matter.Image>();
  private lastHitAt = new WeakMap<Phaser.Physics.Matter.Image, number>();

  private effectiveParams: EffectiveGameplayParams = BASE_PARAMS;
  private spawnTimer: Phaser.Time.TimerEvent | null = null;

  private channelLeftBody: MatterJS.BodyType | null = null;
  private channelRightBody: MatterJS.BodyType | null = null;
  private channelLeftVisual: Phaser.GameObjects.Rectangle | null = null;
  private channelRightVisual: Phaser.GameObjects.Rectangle | null = null;

  private debugMode = false;
  private debugText: Phaser.GameObjects.Text | null = null;
  private sawHits = 0;
  private killedBySaw = 0;
  private collectedAlive = 0;
  private collectedDead = 0;
  private cashFromSaw = 0;
  private cashFromLine = 0;
  private spawnedCount = 0;
  private spawnedChunks = 0;

  private unsubscribeUpgrade: (() => void) | null = null;
  private collisionHandler: ((event: Phaser.Physics.Matter.Events.CollisionStartEvent) => void) | null = null;

  constructor() {
    super('game');
    this.debugMode = new URLSearchParams(window.location.search).has('debug');
  }

  preload(): void {
    this.makeChunkTextures();
    this.makeStopperTexture();
    this.makeSawTexture();
  }

  create(): void {
    // Use resetData (not reset) so UIScene's listeners survive a scene restart.
    gameplayState.resetData();
    this.effectiveParams = applyUpgrades(gameplayState.levels());

    const { width, height } = this.scale;

    this.buildArena(width, height);
    this.buildStopper(width);
    this.rebuildBlades(this.effectiveParams.bladeCount);
    this.rebuildChannelWalls(this.effectiveParams.channelHalfWidth);
    this.buildHud(width);
    this.wireCollisions();

    this.spawner = new AsteroidSpawner(this, this.chunkImages);
    this.rebuildSpawnTimer(this.effectiveParams.spawnIntervalMs);
    this.spawnAsteroid();

    this.unsubscribeUpgrade = gameplayState.on('upgradeLevelChanged', () => {
      this.recomputeEffectiveParams();
    });

    this.events.once('shutdown', () => {
      this.unsubscribeUpgrade?.();
      this.unsubscribeUpgrade = null;
      if (this.collisionHandler) {
        this.matter.world.off('collisionstart', this.collisionHandler);
        this.matter.world.off('collisionactive', this.collisionHandler);
        this.collisionHandler = null;
      }
    });

    this.scene.launch('ui');
  }

  update(_time: number, delta: number): void {
    this.sawAngle += (SAW_ORBIT_RAD_PER_SEC * delta) / 1000;

    const bladeCount = this.sawBlades.length;
    for (let i = 0; i < bladeCount; i++) {
      const phase = this.sawAngle + (i * Math.PI * 2) / bladeCount;
      const sx = this.stopper.x + Math.cos(phase) * SAW_ORBIT_RADIUS;
      const sy = this.stopper.y + Math.sin(phase) * SAW_ORBIT_RADIUS;
      const blade = this.sawBlades[i];
      blade.setPosition(sx, sy);
      blade.setVelocity(0, 0);
      blade.setRotation(blade.rotation + delta * 0.02);
    }

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
          `saw hits ${this.sawHits}  ·  killed by saw ${this.killedBySaw}`,
          `collected dead ${this.collectedDead}  ·  collected alive ${this.collectedAlive}`,
          `cash ledger $${gameplayState.cash} (saw $${this.cashFromSaw} + line $${this.cashFromLine})`,
          `blades ${this.sawBlades.length}  ·  dmg ${this.effectiveParams.sawDamage}  ·  spawn ${this.effectiveParams.spawnIntervalMs}ms`,
        ].join('\n'),
      );
    }
  }

  // ── build ──────────────────────────────────────────────────────────────

  private buildArena(width: number, height: number): void {
    // Outer side walls — catch-all so nothing leaves the canvas. No ceiling;
    // asteroids spawn offscreen above and fall in naturally.
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

  private buildStopper(width: number): void {
    this.stopper = this.matter.add.image(width / 2, 500, 'stopper');
    this.stopper.setCircle(STOPPER_RADIUS);
    this.stopper.setStatic(true);
    this.stopper.setFriction(0.2);
    this.stopper.setInteractive({ draggable: true });
    this.input.setDraggable(this.stopper);
    this.input.on(
      Phaser.Input.Events.DRAG,
      (_pointer: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject, dragX: number, dragY: number) => {
        if (obj !== this.stopper) return;
        const halfW = this.scale.width / 2;
        const halfChannel = this.effectiveParams.channelHalfWidth;
        const minX = halfW - halfChannel + STOPPER_RADIUS + 4;
        const maxX = halfW + halfChannel - STOPPER_RADIUS - 4;
        const cx = Phaser.Math.Clamp(dragX, minX, maxX);
        const cy = Phaser.Math.Clamp(dragY, CHANNEL_TOP_Y + STOPPER_RADIUS + 4, DEATH_LINE_Y - STOPPER_RADIUS - 4);
        this.stopper.setPosition(cx, cy);
      },
    );
  }

  private rebuildBlades(count: number): void {
    for (const blade of this.sawBlades) blade.destroy();
    this.sawBlades = [];
    for (let i = 0; i < count; i++) {
      const blade = this.matter.add.image(0, 0, 'saw');
      blade.setCircle(SAW_RADIUS);
      blade.setSensor(true);
      blade.setIgnoreGravity(true);
      blade.setFrictionAir(0);
      blade.setMass(0.001);
      blade.setData('kind', 'saw');
      this.sawBlades.push(blade);
    }
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
      leftWallX,
      channelMidY,
      CHANNEL_WALL_THICKNESS,
      channelHeight,
      { isStatic: true },
    );
    this.channelRightBody = this.matter.add.rectangle(
      rightWallX,
      channelMidY,
      CHANNEL_WALL_THICKNESS,
      channelHeight,
      { isStatic: true },
    );
    this.channelLeftVisual = this.add
      .rectangle(leftWallX, channelMidY, CHANNEL_WALL_THICKNESS, channelHeight, 0x3a3a4c)
      .setOrigin(0.5);
    this.channelRightVisual = this.add
      .rectangle(rightWallX, channelMidY, CHANNEL_WALL_THICKNESS, channelHeight, 0x3a3a4c)
      .setOrigin(0.5);

    // If the stopper is outside the new channel, pull it in.
    const halfW = this.scale.width / 2;
    const minX = halfW - halfWidth + STOPPER_RADIUS + 4;
    const maxX = halfW + halfWidth - STOPPER_RADIUS - 4;
    this.stopper?.setPosition(
      Phaser.Math.Clamp(this.stopper.x, minX, maxX),
      this.stopper.y,
    );
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

  // ── upgrades ──────────────────────────────────────────────────────────

  private recomputeEffectiveParams(): void {
    const prev = this.effectiveParams;
    this.effectiveParams = applyUpgrades(gameplayState.levels());

    if (this.effectiveParams.bladeCount !== prev.bladeCount) {
      this.rebuildBlades(this.effectiveParams.bladeCount);
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
    if (goA.getData('kind') === 'saw' && goB.getData('kind') === 'chunk') {
      chunk = goB as Phaser.Physics.Matter.Image;
    } else if (goB.getData('kind') === 'saw' && goA.getData('kind') === 'chunk') {
      chunk = goA as Phaser.Physics.Matter.Image;
    }
    if (!chunk) return;
    if (chunk.getData('dead')) return;

    const now = this.time.now;
    const last = this.lastHitAt.get(chunk) ?? -Infinity;
    if (now - last < SAW_HIT_COOLDOWN_MS) return;
    this.lastHitAt.set(chunk, now);

    const asteroid = chunk.getData('asteroid') as Asteroid | undefined;
    if (!asteroid) return;

    const result = asteroid.damageChunkByImage(chunk, this.effectiveParams.sawDamage);
    this.sawHits++;
    this.spawnSpark(chunk.x, chunk.y);

    if (result.killed) {
      this.killedBySaw++;
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

  private spawnSpark(x: number, y: number): void {
    for (let i = 0; i < 3; i++) {
      const s = this.add.circle(x, y, 2, 0xffd166);
      const vx = (Math.random() - 0.5) * 80;
      const vy = (Math.random() - 0.5) * 80 - 20;
      this.tweens.add({
        targets: s,
        x: x + vx,
        y: y + vy,
        alpha: 0,
        duration: 280,
        onComplete: () => s.destroy(),
      });
    }
  }

  private spawnConfetti(x: number, y: number): void {
    for (let i = 0; i < 10; i++) {
      const c = this.add.rectangle(
        x,
        y,
        3 + Math.random() * 2,
        3 + Math.random() * 2,
        Phaser.Display.Color.RandomRGB().color,
      );
      const vx = (Math.random() - 0.5) * 260;
      const vy = -80 - Math.random() * 140;
      this.tweens.add({
        targets: c,
        x: x + vx,
        y: y + vy + 180,
        alpha: 0,
        angle: Math.random() * 360,
        duration: 680,
        onComplete: () => c.destroy(),
      });
    }
  }

  // ── procedural textures ────────────────────────────────────────────────

  private makeChunkTextures(): void {
    const size = CHUNK_PIXEL_SIZE;

    {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff);
      g.fillRect(0, 0, size, size);
      g.lineStyle(1, 0x000000, 0.25);
      g.strokeRect(0.5, 0.5, size - 1, size - 1);
      g.generateTexture('chunk-square', size, size);
      g.destroy();
    }

    const tri = (key: string, verts: [number, number][]): void => {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff);
      g.beginPath();
      g.moveTo(verts[0][0], verts[0][1]);
      g.lineTo(verts[1][0], verts[1][1]);
      g.lineTo(verts[2][0], verts[2][1]);
      g.closePath();
      g.fillPath();
      g.lineStyle(1, 0x000000, 0.25);
      g.strokePath();
      g.generateTexture(key, size, size);
      g.destroy();
    };

    tri('chunk-tri-NE', [
      [0, 0],
      [size, 0],
      [size, size],
    ]);
    tri('chunk-tri-NW', [
      [0, 0],
      [size, 0],
      [0, size],
    ]);
    tri('chunk-tri-SE', [
      [size, 0],
      [size, size],
      [0, size],
    ]);
    tri('chunk-tri-SW', [
      [0, 0],
      [0, size],
      [size, size],
    ]);
  }

  private makeStopperTexture(): void {
    const d = STOPPER_RADIUS * 2;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x8a8aa0);
    g.fillCircle(STOPPER_RADIUS, STOPPER_RADIUS, STOPPER_RADIUS);
    g.lineStyle(2, 0xc8c8dc);
    g.strokeCircle(STOPPER_RADIUS, STOPPER_RADIUS, STOPPER_RADIUS - 1);
    g.fillStyle(0x5a5a70);
    g.fillCircle(STOPPER_RADIUS, STOPPER_RADIUS, 4);
    g.generateTexture('stopper', d, d);
    g.destroy();
  }

  private makeSawTexture(): void {
    const d = SAW_RADIUS * 2 + 4;
    const r = SAW_RADIUS;
    const cx = d / 2;
    const cy = d / 2;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xdddde8);
    g.fillCircle(cx, cy, r);
    g.fillStyle(0x555566);
    g.fillCircle(cx, cy, r / 4);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x = cx + Math.cos(a) * (r - 2);
      const y = cy + Math.sin(a) * (r - 2);
      g.fillStyle(0xffffff);
      g.fillCircle(x, y, 2.5);
    }
    g.generateTexture('saw', d, d);
    g.destroy();
  }
}
