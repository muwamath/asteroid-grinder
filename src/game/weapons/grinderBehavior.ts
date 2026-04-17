import Phaser from 'phaser';
import type { ChunkTarget } from '../chunkTarget';
import type { CompoundAsteroid, WeaponKillSource } from '../compoundAsteroid';
import type { EffectiveGameplayParams } from '../upgradeApplier';
import type { WeaponBehavior, WeaponRawAccess } from './weaponBehavior';
import { CAT_GRINDER_BLADE, MASK_GRINDER_BLADE } from '../collisionCategories';

const BLADE_WIDTH_BASE = 16;
const BLADE_HEIGHT_BASE = 48;
const GRINDER_CLEARANCE = 4;
const GRINDER_HIT_COOLDOWN_MS = 120;
const LAST_HIT_PRUNE_INTERVAL_MS = 1000;
const LAST_HIT_STALE_MS = 1000;
const BLADE_TEXTURE_KEY = 'grinder-blade';
const HOUSING_TEXTURE_KEY = 'grinder-housing';

export interface GrinderBladeLayout {
  readonly n: number;
  readonly actualWidth: number;
}

export function computeBladeLayout(
  channelWidth: number,
  bladeScale: number,
): GrinderBladeLayout {
  const bladeW = BLADE_WIDTH_BASE * bladeScale;
  const n = Math.max(1, Math.ceil(channelWidth / bladeW));
  return { n, actualWidth: channelWidth / n };
}

interface Blade {
  body: MatterJS.BodyType;
  sprite: Phaser.GameObjects.Image;
  direction: 1 | -1;
}

interface SceneWithMatter extends Phaser.Scene {
  matter: Phaser.Physics.Matter.MatterPhysics;
}

interface SceneWithDamage extends Phaser.Scene {
  damageLiveChunk(
    ast: CompoundAsteroid,
    chunkId: string,
    amount: number,
    killer: WeaponKillSource,
  ): boolean;
}

export class GrinderBehavior implements WeaponBehavior {
  readonly textureKey = HOUSING_TEXTURE_KEY;
  readonly bodyRadius = 1;

  private blades: Blade[] = [];
  private omega = 0;
  private damage = 1;
  private bladeScale = 1;
  private channelWidth = 0;
  private readonly deathLineY: number;
  private readonly channelCenterX: number;
  private instanceId: string | undefined;

  private lastHitAt = new Map<string, number>();
  private lastPruneAt = 0;
  private hitCount = 0;
  private killCount = 0;

  constructor(opts: { deathLineY: number; channelCenterX: number }) {
    this.deathLineY = opts.deathLineY;
    this.channelCenterX = opts.channelCenterX;
  }

  createTextures(scene: Phaser.Scene): void {
    this.makeBladeTexture(scene);
    if (!scene.textures.exists(HOUSING_TEXTURE_KEY)) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0x2a2d33);
      g.fillRect(0, 0, 8, 8);
      g.generateTexture(HOUSING_TEXTURE_KEY, 8, 8);
      g.destroy();
    }
  }

  init(scene: Phaser.Scene, sprite: Phaser.Physics.Matter.Image, params: EffectiveGameplayParams): void {
    this.instanceId = sprite.getData('instanceId') as string | undefined;
    this.omega = params.grinderSpinSpeed;
    this.damage = params.grinderDamage;
    this.bladeScale = params.grinderBladeScale;
    this.channelWidth = params.channelHalfWidth * 2;
    this.retile(scene);
  }

  update(
    scene: Phaser.Scene,
    _sprite: Phaser.Physics.Matter.Image,
    delta: number,
    _chunks: readonly ChunkTarget[],
    _params: EffectiveGameplayParams,
    _raw?: WeaponRawAccess,
  ): void {
    const now = scene.time.now;
    if (now - this.lastPruneAt >= LAST_HIT_PRUNE_INTERVAL_MS) {
      const cutoff = now - LAST_HIT_STALE_MS;
      for (const [key, t] of this.lastHitAt) {
        if (t < cutoff) this.lastHitAt.delete(key);
      }
      this.lastPruneAt = now;
    }

    const dt = delta / 1000;
    const matterBody = (scene as SceneWithMatter).matter.body;
    for (const blade of this.blades) {
      const newAngle = blade.body.angle + blade.direction * this.omega * dt;
      matterBody.setAngle(blade.body, newAngle);
      blade.sprite.setRotation(newAngle);
    }
  }

  onUpgrade(
    scene: Phaser.Scene,
    _sprite: Phaser.Physics.Matter.Image,
    prev: EffectiveGameplayParams,
    next: EffectiveGameplayParams,
  ): void {
    this.omega = next.grinderSpinSpeed;
    this.damage = next.grinderDamage;
    const widthChanged = next.channelHalfWidth !== prev.channelHalfWidth;
    const scaleChanged = next.grinderBladeScale !== prev.grinderBladeScale;
    if (widthChanged || scaleChanged) {
      this.bladeScale = next.grinderBladeScale;
      this.channelWidth = next.channelHalfWidth * 2;
      this.retile(scene);
    }
  }

  handleCompoundHit(
    asteroid: CompoundAsteroid,
    chunkId: string,
    _weaponBody: MatterJS.BodyType,
    _params: EffectiveGameplayParams,
    scene: Phaser.Scene,
  ): { hit: boolean; killed: boolean } {
    const now = scene.time.now;
    const key = `${asteroid.id}/${chunkId}`;
    const last = this.lastHitAt.get(key) ?? -Infinity;
    if (now - last < GRINDER_HIT_COOLDOWN_MS) return { hit: false, killed: false };
    this.lastHitAt.set(key, now);

    const sceneTyped = scene as SceneWithDamage;
    const killed = sceneTyped.damageLiveChunk(asteroid, chunkId, this.damage, 'grinder');
    this.hitCount++;
    if (killed) this.killCount++;
    return { hit: true, killed };
  }

  destroy(): void {
    for (const blade of this.blades) blade.sprite.destroy();
    this.blades = [];
  }

  get stats() {
    return { blades: this.blades.length, hits: this.hitCount, kills: this.killCount };
  }

  private retile(scene: Phaser.Scene): void {
    const matter = (scene as SceneWithMatter).matter;
    for (const blade of this.blades) {
      blade.sprite.destroy();
      matter.world.remove(blade.body);
    }
    this.blades = [];

    const { n, actualWidth } = computeBladeLayout(this.channelWidth, this.bladeScale);
    const bladeH = BLADE_HEIGHT_BASE * this.bladeScale;
    const centerY = this.deathLineY - bladeH / 2 - GRINDER_CLEARANCE;
    const leftX = this.channelCenterX - this.channelWidth / 2;

    for (let i = 0; i < n; i++) {
      const cx = leftX + actualWidth * (i + 0.5);
      const body = matter.add.rectangle(cx, centerY, actualWidth, bladeH, {
        isStatic: true,
        collisionFilter: {
          category: CAT_GRINDER_BLADE,
          mask: MASK_GRINDER_BLADE,
        },
      }) as unknown as MatterJS.BodyType;
      (body as unknown as { plugin: Record<string, unknown> }).plugin = {
        kind: 'grinder',
        instanceId: this.instanceId,
      };
      const sprite = scene.add.image(cx, centerY, BLADE_TEXTURE_KEY);
      sprite.setDisplaySize(actualWidth, bladeH);
      sprite.setDepth(1);
      this.blades.push({
        body,
        sprite,
        direction: i % 2 === 0 ? 1 : -1,
      });
    }
  }

  private makeBladeTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(BLADE_TEXTURE_KEY)) return;
    const w = 64;
    const h = 48;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x4a4e58);
    g.fillRect(0, 0, w, h);
    g.fillStyle(0x7a818c);
    const stripeH = Math.floor(h * 0.25);
    g.fillRect(0, (h - stripeH) / 2, w, stripeH);
    g.lineStyle(1, 0x2a2d33);
    g.strokeRect(0, 0, w, h);
    g.generateTexture(BLADE_TEXTURE_KEY, w, h);
    g.destroy();
  }
}
