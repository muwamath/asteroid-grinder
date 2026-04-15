import Phaser from 'phaser';

const PINATA_COLORS = [0xff6b9d, 0xffd166, 0x06d6a0, 0x118ab2, 0xef476f, 0xc77dff];
const PINATA_BLOCK_SIZE = 24;
const PINATA_HP = 3;
const PINATA_GRID = 3;

const STOPPER_RADIUS = 32;
const SAW_ORBIT_RADIUS = 56;
const SAW_ORBIT_RAD_PER_SEC = 4;
const SAW_RADIUS = 18;
const SAW_DAMAGE_PER_HIT = 1;
const SAW_HIT_COOLDOWN_MS = 120;

const SPAWN_INTERVAL_MS = 1400;
const DEATH_LINE_Y = 580;

export class GameScene extends Phaser.Scene {
  private cash = 0;
  private cashText!: Phaser.GameObjects.Text;

  private stopper!: Phaser.Physics.Matter.Image;
  private sawBlade!: Phaser.Physics.Matter.Image;
  private sawAngle = 0;

  private blocks = new Set<Phaser.Physics.Matter.Image>();
  private lastHitAt = new WeakMap<Phaser.Physics.Matter.Image, number>();

  private debugMode = false;
  private debugText: Phaser.GameObjects.Text | null = null;
  private sawHits = 0;
  private killedBySaw = 0;
  private collectedAlive = 0;
  private collectedDead = 0;
  private cashFromSaw = 0;
  private cashFromLine = 0;

  constructor() {
    super('game');
    this.debugMode = new URLSearchParams(window.location.search).has('debug');
  }

  preload(): void {
    this.makeBlockTexture();
    this.makeStopperTexture();
    this.makeSawTexture();
  }

  create(): void {
    const { width, height } = this.scale;

    this.buildArena(width, height);
    this.buildStopperAndSaw(width);
    this.buildHud(width);
    this.wireCollisions();

    this.time.addEvent({
      delay: SPAWN_INTERVAL_MS,
      loop: true,
      callback: () => this.spawnPinata(),
    });
  }

  update(_time: number, delta: number): void {
    this.sawAngle += (SAW_ORBIT_RAD_PER_SEC * delta) / 1000;
    const sx = this.stopper.x + Math.cos(this.sawAngle) * SAW_ORBIT_RADIUS;
    const sy = this.stopper.y + Math.sin(this.sawAngle) * SAW_ORBIT_RADIUS;
    this.sawBlade.setPosition(sx, sy);
    this.sawBlade.setVelocity(0, 0);
    this.sawBlade.setRotation(this.sawBlade.rotation + (delta * 0.02));

    for (const block of this.blocks) {
      if (!block.active) {
        this.blocks.delete(block);
        continue;
      }
      if (block.y > DEATH_LINE_Y) {
        this.collectAtDeathLine(block);
      } else if (block.y > this.scale.height + 120) {
        this.blocks.delete(block);
        block.destroy();
      }
    }

    if (this.debugMode && this.debugText) {
      const fps = Math.round(this.game.loop.actualFps);
      const world = this.matter.world.localWorld as unknown as { bodies: unknown[] };
      const bodies = world.bodies.length;
      this.debugText.setText(
        [
          `FPS ${fps}  ·  bodies ${bodies}  ·  live blocks ${this.blocks.size}`,
          `saw hits ${this.sawHits}  ·  killed by saw ${this.killedBySaw}`,
          `collected dead ${this.collectedDead}  ·  collected alive ${this.collectedAlive}`,
          `cash: $${this.cash}  (saw $${this.cashFromSaw}  +  line $${this.cashFromLine})`,
        ].join('\n'),
      );
    }
  }

  // ── build ──────────────────────────────────────────────────────────────

  private buildArena(width: number, height: number): void {
    const wallT = 20;
    this.matter.add.rectangle(width / 2, -wallT / 2, width, wallT, { isStatic: true });
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

  private buildStopperAndSaw(width: number): void {
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
        const cx = Phaser.Math.Clamp(dragX, STOPPER_RADIUS + 4, this.scale.width - STOPPER_RADIUS - 4);
        const cy = Phaser.Math.Clamp(dragY, STOPPER_RADIUS + 60, DEATH_LINE_Y - STOPPER_RADIUS - 4);
        this.stopper.setPosition(cx, cy);
      },
    );

    this.sawBlade = this.matter.add.image(width / 2 + SAW_ORBIT_RADIUS, 500, 'saw');
    this.sawBlade.setCircle(SAW_RADIUS);
    this.sawBlade.setSensor(true);
    this.sawBlade.setIgnoreGravity(true);
    this.sawBlade.setFrictionAir(0);
    this.sawBlade.setMass(0.001);
    this.sawBlade.setData('kind', 'saw');
  }

  private buildHud(width: number): void {
    this.cashText = this.add.text(14, 10, '$0', {
      font: 'bold 26px ui-monospace',
      color: '#ffd166',
    });

    this.add
      .text(width / 2, 12, 'drag the grey stopper · chop the pinatas · keep them off the red line', {
        font: '13px ui-monospace',
        color: '#888',
      })
      .setOrigin(0.5, 0);

    if (this.debugMode) {
      this.debugText = this.add.text(14, this.scale.height - 76, '', {
        font: '11px ui-monospace',
        color: '#6cf',
        backgroundColor: '#0008',
        padding: { x: 6, y: 4 },
      });
    }
  }

  private wireCollisions(): void {
    const handler = (event: Phaser.Physics.Matter.Events.CollisionStartEvent): void => {
      for (const pair of event.pairs) {
        this.handleContact(pair.bodyA, pair.bodyB);
      }
    };
    this.matter.world.on('collisionstart', handler);
    this.matter.world.on('collisionactive', handler);
  }

  // ── gameplay ───────────────────────────────────────────────────────────

  private spawnPinata(): void {
    const color = PINATA_COLORS[Math.floor(Math.random() * PINATA_COLORS.length)];
    const margin = 120;
    const startX = margin + Math.random() * (this.scale.width - margin * 2);
    const startY = 40;

    for (let r = 0; r < PINATA_GRID; r++) {
      for (let c = 0; c < PINATA_GRID; c++) {
        const x = startX + (c - (PINATA_GRID - 1) / 2) * PINATA_BLOCK_SIZE;
        const y = startY + r * PINATA_BLOCK_SIZE;
        const block = this.matter.add.image(x, y, 'block');
        block.setRectangle(PINATA_BLOCK_SIZE - 1, PINATA_BLOCK_SIZE - 1);
        block.setTint(color);
        block.setFriction(0.1);
        block.setFrictionAir(0.01);
        block.setMass(0.3);
        block.setBounce(0.05);
        block.setData('kind', 'pinata');
        block.setData('hp', PINATA_HP);
        block.setData('maxHp', PINATA_HP);
        block.setData('dead', false);
        block.setData('baseTint', color);
        this.blocks.add(block);
      }
    }
  }

  private handleContact(bodyA: MatterJS.BodyType, bodyB: MatterJS.BodyType): void {
    const goA = (bodyA as { gameObject?: Phaser.GameObjects.GameObject }).gameObject;
    const goB = (bodyB as { gameObject?: Phaser.GameObjects.GameObject }).gameObject;
    if (!goA || !goB) return;

    let block: Phaser.Physics.Matter.Image | null = null;
    if (goA === this.sawBlade && goB.getData('kind') === 'pinata') {
      block = goB as Phaser.Physics.Matter.Image;
    } else if (goB === this.sawBlade && goA.getData('kind') === 'pinata') {
      block = goA as Phaser.Physics.Matter.Image;
    }
    if (!block) return;
    if (block.getData('dead')) return;

    const now = this.time.now;
    const last = this.lastHitAt.get(block) ?? -Infinity;
    if (now - last < SAW_HIT_COOLDOWN_MS) return;
    this.lastHitAt.set(block, now);

    const hp = (block.getData('hp') as number) - SAW_DAMAGE_PER_HIT;
    block.setData('hp', hp);
    this.sawHits++;
    this.spawnSpark(block.x, block.y);

    if (hp <= 0) {
      this.killedBySaw++;
      this.killBlock(block);
    }
  }

  private killBlock(block: Phaser.Physics.Matter.Image): void {
    block.setData('dead', true);
    block.setAlpha(0.5);
    block.setTint(0x555566);
  }

  private collectAtDeathLine(block: Phaser.Physics.Matter.Image): void {
    const dead = block.getData('dead') as boolean;
    if (dead) {
      const maxHp = block.getData('maxHp') as number;
      const amount = Math.max(1, maxHp * 2);
      this.earn(amount);
      this.cashFromSaw += amount;
      this.collectedDead++;
      this.spawnConfetti(block.x, block.y);
    } else {
      this.earn(1);
      this.cashFromLine += 1;
      this.collectedAlive++;
    }
    this.blocks.delete(block);
    block.destroy();
  }

  private earn(amount: number): void {
    this.cash += amount;
    this.cashText.setText(`$${this.cash}`);
    this.tweens.add({
      targets: this.cashText,
      scale: { from: 1.15, to: 1 },
      duration: 160,
      ease: 'Quad.out',
    });
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

  private makeBlockTexture(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff);
    g.fillRect(0, 0, PINATA_BLOCK_SIZE, PINATA_BLOCK_SIZE);
    g.lineStyle(1, 0x000000, 0.25);
    g.strokeRect(0.5, 0.5, PINATA_BLOCK_SIZE - 1, PINATA_BLOCK_SIZE - 1);
    g.generateTexture('block', PINATA_BLOCK_SIZE, PINATA_BLOCK_SIZE);
    g.destroy();
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
