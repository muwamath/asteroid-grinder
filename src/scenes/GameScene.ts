import Phaser from 'phaser';
import type { Asteroid } from '../game/asteroid';
import { CHUNK_PIXEL_SIZE } from '../game/asteroid';
import { AsteroidSpawner } from '../game/asteroidSpawner';
import { gameplayState } from '../game/gameplayState';
import { BASE_PARAMS, applyUpgrades, type EffectiveGameplayParams } from '../game/upgradeApplier';
import { WEAPON_TYPES } from '../game/weaponCatalog';

const STOPPER_RADIUS = 32;
const SAW_HUB_RADIUS = 16;
const SAW_BLADE_RADIUS = 28;
const SAW_ORBIT_RAD_PER_SEC = 4;
const SAW_HIT_COOLDOWN_MS = 120;

const SPAWN_Y = -80;
const DEATH_LINE_Y = 580;

const CHANNEL_WALL_THICKNESS = 12;
const CHANNEL_TOP_Y = 80;

interface WeaponInstance {
  id: string;
  type: string;
  sprite: Phaser.Physics.Matter.Image;
  orbitAngle: number;
  blades: Phaser.Physics.Matter.Image[];
}

export class GameScene extends Phaser.Scene {
  private weaponInstances: WeaponInstance[] = [];
  private nextInstanceId = 0;

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
    this.makeStopperTexture();
    this.makeSawHubTexture();
    this.makeSawBladeTexture();
  }

  create(): void {
    // Use resetData (not reset) so UIScene's listeners survive a scene restart.
    gameplayState.resetData();
    this.effectiveParams = applyUpgrades(gameplayState.levels());

    const { width, height } = this.scale;

    this.buildArena(width, height);
    this.rebuildChannelWalls(this.effectiveParams.channelHalfWidth);
    this.buildHud(width);
    this.wireCollisions();
    this.wireDrag();

    // Spawn initial weapon instances (one per unlocked type).
    for (const wt of WEAPON_TYPES) {
      if (wt.locked) continue;
      for (let i = 0; i < wt.startCount; i++) {
        const jitter = (Math.random() - 0.5) * 40;
        this.spawnWeaponInstance(wt.id, width / 2 + jitter, 500);
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
        for (const blade of inst.blades) blade.destroy();
        inst.sprite.destroy();
      }
      this.weaponInstances = [];
    });

    this.scene.launch('ui');
  }

  update(_time: number, delta: number): void {
    for (const inst of this.weaponInstances) {
      if (inst.type === 'saw' && inst.blades.length > 0) {
        const dir = gameplayState.sawClockwise ? 1 : -1;
        const spinRate = dir * SAW_ORBIT_RAD_PER_SEC * delta / 1000;
        for (const blade of inst.blades) {
          blade.setPosition(inst.sprite.x, inst.sprite.y);
          blade.setVelocity(0, 0);
          blade.setRotation(blade.rotation + spinRate);
        }
      }
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

  private spawnWeaponInstance(typeId: string, x: number, y: number): WeaponInstance {
    const id = `${typeId}-${this.nextInstanceId++}`;
    const texKey = typeId === 'grinder' ? 'stopper' : typeId === 'saw' ? 'saw-hub' : typeId;
    const collisionRadius = typeId === 'saw' ? SAW_HUB_RADIUS : STOPPER_RADIUS;

    const sprite = this.matter.add.image(x, y, texKey);
    sprite.setCircle(collisionRadius);
    sprite.setStatic(true);
    sprite.setFriction(0.2);
    sprite.setInteractive({ draggable: true });
    this.input.setDraggable(sprite);
    sprite.setData('kind', typeId);
    sprite.setData('instanceId', id);
    if (typeId === 'saw') sprite.setDepth(1); // hub renders above blades

    const instance: WeaponInstance = {
      id,
      type: typeId,
      sprite,
      orbitAngle: 0,
      blades: [],
    };

    this.weaponInstances.push(instance);

    if (typeId === 'saw') {
      this.rebuildBladesForInstance(instance, this.effectiveParams.bladeCount);
    }

    return instance;
  }

  private rebuildBladesForInstance(instance: WeaponInstance, count: number): void {
    for (const blade of instance.blades) blade.destroy();
    instance.blades = [];
    for (let i = 0; i < count; i++) {
      const blade = this.matter.add.image(0, 0, 'saw-blade');
      blade.setCircle(SAW_BLADE_RADIUS);
      blade.setSensor(true);
      blade.setIgnoreGravity(true);
      blade.setFrictionAir(0);
      blade.setMass(0.001);
      blade.setDepth(-1); // render under the hub
      blade.setData('kind', 'saw');
      instance.blades.push(blade);
    }
  }

  private wireDrag(): void {
    this.dragHandler = (
      _pointer: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject, dragX: number, dragY: number,
    ) => {
        const inst = this.weaponInstances.find((w) => w.sprite === obj);
        if (!inst) return;
        const halfW = this.scale.width / 2;
        const halfChannel = this.effectiveParams.channelHalfWidth;
        const radius = inst.type === 'saw' ? SAW_HUB_RADIUS : STOPPER_RADIUS;
        const minX = halfW - halfChannel + radius + 4;
        const maxX = halfW + halfChannel - radius - 4;
        const cx = Phaser.Math.Clamp(dragX, minX, maxX);
        const cy = Phaser.Math.Clamp(dragY, CHANNEL_TOP_Y + radius + 4, DEATH_LINE_Y - radius - 4);
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

    // If any weapons are outside the new channel, pull them in.
    const halfW = this.scale.width / 2;
    for (const inst of this.weaponInstances) {
      const r = inst.type === 'saw' ? SAW_HUB_RADIUS : STOPPER_RADIUS;
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
      // Buy — spawn at random position in channel.
      const halfW = this.scale.width / 2;
      const halfChannel = this.effectiveParams.channelHalfWidth;
      const rx = halfW + (Math.random() - 0.5) * halfChannel;
      const ry = CHANNEL_TOP_Y + 100 + Math.random() * (DEATH_LINE_Y - CHANNEL_TOP_Y - 200);
      this.spawnWeaponInstance(typeId, rx, ry);
    } else if (newCount < currentInstances.length) {
      // Sell — remove a random instance of this type.
      const idx = Math.floor(Math.random() * currentInstances.length);
      const victim = currentInstances[idx];
      for (const blade of victim.blades) blade.destroy();
      victim.sprite.destroy();
      this.weaponInstances = this.weaponInstances.filter((i) => i !== victim);
    }
  }

  // ── upgrades ──────────────────────────────────────────────────────────

  private recomputeEffectiveParams(): void {
    const prev = this.effectiveParams;
    this.effectiveParams = applyUpgrades(gameplayState.levels());

    if (this.effectiveParams.bladeCount !== prev.bladeCount) {
      for (const inst of this.weaponInstances) {
        if (inst.type === 'saw') {
          this.rebuildBladesForInstance(inst, this.effectiveParams.bladeCount);
        }
      }
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
    let damageSource: string | null = null;

    if (goA.getData('kind') === 'saw' && goB.getData('kind') === 'chunk') {
      chunk = goB as Phaser.Physics.Matter.Image;
      damageSource = 'saw';
    } else if (goB.getData('kind') === 'saw' && goA.getData('kind') === 'chunk') {
      chunk = goA as Phaser.Physics.Matter.Image;
      damageSource = 'saw';
    } else if (goA.getData('kind') === 'grinder' && goB.getData('kind') === 'chunk') {
      chunk = goB as Phaser.Physics.Matter.Image;
      damageSource = 'grinder';
    } else if (goB.getData('kind') === 'grinder' && goA.getData('kind') === 'chunk') {
      chunk = goA as Phaser.Physics.Matter.Image;
      damageSource = 'grinder';
    }

    if (!chunk || !damageSource) return;
    if (chunk.getData('dead')) return;

    const now = this.time.now;
    const last = this.lastHitAt.get(chunk) ?? -Infinity;
    if (now - last < SAW_HIT_COOLDOWN_MS) return;
    this.lastHitAt.set(chunk, now);

    const asteroid = chunk.getData('asteroid') as Asteroid | undefined;
    if (!asteroid) return;

    const damage = damageSource === 'saw'
      ? this.effectiveParams.sawDamage
      : (1 + gameplayState.levelOf('grinder.damage'));

    const result = asteroid.damageChunkByImage(chunk, damage);
    this.weaponHits++;
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

  private makeSawHubTexture(): void {
    const d = SAW_HUB_RADIUS * 2 + 4;
    const cx = d / 2;
    const cy = d / 2;
    const r = SAW_HUB_RADIUS;
    const g = this.make.graphics({ x: 0, y: 0 }, false);

    // Body
    g.fillStyle(0x5a5a70);
    g.fillCircle(cx, cy, r);

    // Outline
    g.lineStyle(2, 0x8a8aa0);
    g.strokeCircle(cx, cy, r - 1);

    // 4 radial spokes
    g.lineStyle(1.5, 0x8a8aa0);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2));
      g.strokePath();
    }

    // Center axle dot
    g.fillStyle(0x3a3a4c);
    g.fillCircle(cx, cy, 3);

    g.generateTexture('saw-hub', d, d);
    g.destroy();
  }

  private makeSawBladeTexture(): void {
    const d = SAW_BLADE_RADIUS * 2 + 4;
    const cx = d / 2;
    const cy = d / 2;
    const r = SAW_BLADE_RADIUS;
    const g = this.make.graphics({ x: 0, y: 0 }, false);

    // 4-quadrant pinwheel: opposite quadrants same color
    const colors = [0xdddde8, 0x555566];
    for (let i = 0; i < 4; i++) {
      const startAngle = (i * Math.PI) / 2;
      const endAngle = ((i + 1) * Math.PI) / 2;
      g.fillStyle(colors[i % 2]);
      g.beginPath();
      g.moveTo(cx, cy);
      g.arc(cx, cy, r, startAngle, endAngle, false);
      g.closePath();
      g.fillPath();
    }

    // Outer ring stroke
    g.lineStyle(1, 0x888898);
    g.strokeCircle(cx, cy, r);

    // Center mounting hole
    g.fillStyle(0x3a3a4c);
    g.fillCircle(cx, cy, 2.5);

    g.generateTexture('saw-blade', d, d);
    g.destroy();
  }
}
