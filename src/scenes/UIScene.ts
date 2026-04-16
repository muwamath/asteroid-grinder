import Phaser from 'phaser';
import { gameplayState } from '../game/gameplayState';
import {
  WEAPON_TYPES,
  CATEGORY_DEFS,
  type WeaponTypeDef,
  type CategoryDef,
} from '../game/weaponCatalog';
import { costAtLevel, isMaxed, type UpgradeDef } from '../game/upgradeCatalog';
import type { GameScene } from './GameScene';

const BAR_X = 8;
const BAR_Y = 44;
const BAR_BUTTON_SIZE = 52;
const BAR_GAP = 6;
const SUBPANEL_X = BAR_X + BAR_BUTTON_SIZE + 6;
const SUBPANEL_W = 170;

export class UIScene extends Phaser.Scene {
  private cashText!: Phaser.GameObjects.Text;
  private barButtons: WeaponBarButton[] = [];
  private activePanel: SubPanel | null = null;
  private selectedId: string | null = null;
  private unsubs: Array<() => void> = [];
  private optionsModal: OptionsModal | null = null;
  private saveToast: Phaser.GameObjects.Text | null = null;
  private saveToastTween: Phaser.Tweens.Tween | null = null;
  private escKey: Phaser.Input.Keyboard.Key | null = null;

  constructor() {
    super('ui');
  }

  create(): void {
    // Seed from current state — GameScene's loadSnapshot fires cashChanged
    // before UIScene is launched, so a cold subscription would miss it.
    this.cashText = this.add.text(BAR_X, 10, `$${gameplayState.cash}`, {
      font: 'bold 26px ui-monospace',
      color: '#ffd166',
    });

    this.buildWeaponBar();
    this.buildOptionsGear();

    this.unsubs.push(
      gameplayState.on('cashChanged', (cash) => {
        this.cashText.setText(`$${cash}`);
        this.tweens.add({
          targets: this.cashText,
          scale: { from: 1.15, to: 1 },
          duration: 160,
          ease: 'Quad.out',
        });
        this.activePanel?.refresh();
      }),
    );
    this.unsubs.push(
      gameplayState.on('upgradeLevelChanged', () => {
        this.activePanel?.refresh();
      }),
    );
    this.unsubs.push(
      gameplayState.on('weaponCountChanged', (id) => {
        // Update the count badge on the matching bar button.
        const allDefs: Array<WeaponTypeDef | CategoryDef> = [...CATEGORY_DEFS, ...WEAPON_TYPES];
        for (let i = 0; i < allDefs.length; i++) {
          if (allDefs[i].id === id && this.barButtons[i]) {
            this.barButtons[i].updateCount(gameplayState.weaponCount(id));
          }
        }
        this.activePanel?.refresh();
      }),
    );
    this.unsubs.push(
      gameplayState.on('sawDirectionChanged', () => {
        this.activePanel?.refresh();
      }),
    );

    this.events.once('shutdown', () => {
      for (const u of this.unsubs) u();
      this.unsubs = [];
      if (this.escKey) {
        this.escKey.removeAllListeners();
        this.input.keyboard?.removeKey(this.escKey);
        this.escKey = null;
      }
    });

    const award = (this.game.registry.get('offlineAward') as number | undefined) ?? 0;
    const elapsed = (this.game.registry.get('offlineElapsedMs') as number | undefined) ?? 0;
    if (award > 0 && elapsed > 0) {
      this.showWelcomeBack(award, elapsed);
      this.game.registry.set('offlineAward', 0);
      this.game.registry.set('offlineElapsedMs', 0);
    }
  }

  private showWelcomeBack(award: number, elapsedMs: number): void {
    const { width, height } = this.scale;
    const layer: Phaser.GameObjects.GameObject[] = [];
    const overlay = this.add
      .rectangle(0, 0, width, height, 0x000000, 0.65)
      .setOrigin(0, 0)
      .setInteractive()
      .setDepth(1000);
    const panelW = 440;
    const panelH = 220;
    const panel = this.add
      .rectangle(width / 2, height / 2, panelW, panelH, 0x1f1f30)
      .setStrokeStyle(2, 0xffffff, 0.3)
      .setDepth(1001);

    const hours = Math.floor(elapsedMs / 3_600_000);
    const minutes = Math.floor((elapsedMs % 3_600_000) / 60_000);
    const away = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

    const title = this.add
      .text(width / 2, height / 2 - 70, 'Welcome back!', {
        fontFamily: 'sans-serif',
        fontSize: '28px',
        color: '#ffd166',
      })
      .setOrigin(0.5)
      .setDepth(1002);

    const body = this.add
      .text(
        width / 2,
        height / 2 - 15,
        `Away for ${away}.\nYour saws earned $${award.toLocaleString()}.`,
        {
          fontFamily: 'sans-serif',
          fontSize: '18px',
          color: '#cccccc',
          align: 'center',
        },
      )
      .setOrigin(0.5)
      .setDepth(1002);

    const btn = this.add
      .rectangle(width / 2, height / 2 + 60, 160, 44, 0x2d7a3d)
      .setStrokeStyle(2, 0xffffff, 0.5)
      .setInteractive({ useHandCursor: true })
      .setDepth(1002);
    const btnText = this.add
      .text(width / 2, height / 2 + 60, 'Collect', {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(1003);

    layer.push(overlay, panel, title, body, btn, btnText);

    btn.on('pointerdown', () => {
      // Silent: offline award is not organic earnings — don't let it spike
      // the rolling cash-rate EMA, which would inflate the next offline payout.
      gameplayState.addCash(award, { silent: true });
      for (const obj of layer) obj.destroy();
    });
  }

  private buildWeaponBar(): void {
    let y = BAR_Y;

    // Categories first (Chute, Asteroids).
    for (const cat of CATEGORY_DEFS) {
      const btn = new WeaponBarButton(
        this, BAR_X, y, cat, false,
        () => this.togglePanel(cat.id, cat, false),
      );
      this.barButtons.push(btn);
      y += BAR_BUTTON_SIZE + BAR_GAP;
    }

    // Divider.
    this.add.text(BAR_X, y + 2, '─WEAPONS─', {
      font: 'bold 8px ui-monospace',
      color: '#606078',
    });
    y += 18;

    // Weapons.
    for (const wt of WEAPON_TYPES) {
      const btn = new WeaponBarButton(
        this, BAR_X, y, wt, true,
        () => this.togglePanel(wt.id, wt, true),
      );
      this.barButtons.push(btn);
      y += BAR_BUTTON_SIZE + BAR_GAP;
    }
  }

  // ── options gear + modal ────────────────────────────────────────────────

  private buildOptionsGear(): void {
    const { width } = this.scale;
    const btnSize = 34;
    const x = width - btnSize - 10;
    const y = 10;

    const bg = this.add
      .rectangle(x, y, btnSize, btnSize, 0x202030)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x4a4a5c)
      .setInteractive({ useHandCursor: true })
      .setDepth(500);
    const label = this.add
      .text(x + btnSize / 2, y + btnSize / 2, '⚙', {
        font: 'bold 20px ui-monospace',
        color: '#c0c0d8',
      })
      .setOrigin(0.5)
      .setDepth(501);

    bg.on('pointerover', () => bg.setFillStyle(0x2a2a40));
    bg.on('pointerout', () => bg.setFillStyle(0x202030));
    bg.on('pointerdown', () => this.openOptions());

    if (this.input.keyboard) {
      this.escKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
      this.escKey.on('down', () => {
        if (this.optionsModal) this.closeOptions();
        else this.openOptions();
      });
    }

    // Keep a handle in case we need to re-layout later.
    void label;
  }

  openOptions(): void {
    if (this.optionsModal) return;
    this.optionsModal = new OptionsModal(this);
  }

  closeOptions(): void {
    this.optionsModal?.destroy();
    this.optionsModal = null;
  }

  doManualSave(): void {
    const gs = this.scene.get('game') as GameScene;
    gs.snapshotNow();
    this.flashSaveToast();
  }

  doRestart(): void {
    const gs = this.scene.get('game') as GameScene;
    gs.restartGame();
  }

  doToggleDebug(): void {
    const gs = this.scene.get('game') as GameScene;
    gs.toggleDebugOverlay();
  }

  getDebugEnabled(): boolean {
    const gs = this.scene.get('game') as GameScene;
    return gs.debugEnabled;
  }

  private flashSaveToast(): void {
    if (this.saveToastTween) {
      this.saveToastTween.stop();
      this.saveToastTween = null;
    }
    if (!this.saveToast) {
      this.saveToast = this.add
        .text(this.scale.width - 10, 52, 'Saved', {
          font: 'bold 14px ui-monospace',
          color: '#b0ffa8',
          backgroundColor: '#00000080',
          padding: { x: 8, y: 4 },
        })
        .setOrigin(1, 0)
        .setDepth(600);
    }
    this.saveToast.setVisible(true).setAlpha(1);
    this.saveToastTween = this.tweens.add({
      targets: this.saveToast,
      alpha: 0,
      duration: 1200,
      delay: 600,
      ease: 'Quad.in',
      onComplete: () => {
        this.saveToast?.setVisible(false);
        this.saveToastTween = null;
      },
    });
  }

  private togglePanel(id: string, def: WeaponTypeDef | CategoryDef, isWeapon: boolean): void {
    if (this.selectedId === id) {
      // Close current panel.
      this.activePanel?.destroy();
      this.activePanel = null;
      this.selectedId = null;
      for (const btn of this.barButtons) btn.setSelected(false);
      return;
    }

    // Close old, open new.
    this.activePanel?.destroy();
    this.selectedId = id;
    for (const btn of this.barButtons) btn.setSelected(false);

    const allDefs: Array<WeaponTypeDef | CategoryDef> = [...CATEGORY_DEFS, ...WEAPON_TYPES];
    const idx = allDefs.findIndex((d) => d.id === id);
    if (idx >= 0 && this.barButtons[idx]) {
      this.barButtons[idx].setSelected(true);
    }

    this.activePanel = new SubPanel(this, def, isWeapon);
    this.activePanel.refresh();
  }
}

// ── WeaponBarButton ──────────────────────────────────────────────────────

class WeaponBarButton {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly countText: Phaser.GameObjects.Text | null;
  private readonly isLocked: boolean;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    def: WeaponTypeDef | CategoryDef,
    isWeapon: boolean,
    onClick: () => void,
  ) {
    this.isLocked = isWeapon && (def as WeaponTypeDef).locked;

    this.bg = scene.add
      .rectangle(x, y, BAR_BUTTON_SIZE, BAR_BUTTON_SIZE, this.isLocked ? 0x141420 : 0x202030)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x4a4a5c);

    if (!this.isLocked) {
      this.bg.setInteractive({ useHandCursor: true });
      this.bg.on('pointerdown', () => onClick());
    }

    // Icon placeholder — first letter of name, large.
    scene.add
      .text(x + BAR_BUTTON_SIZE / 2, y + BAR_BUTTON_SIZE / 2 - 4, def.name.charAt(0), {
        font: 'bold 20px ui-monospace',
        color: this.isLocked ? '#303040' : '#8080a0',
      })
      .setOrigin(0.5);

    scene.add
      .text(x + BAR_BUTTON_SIZE / 2, y + BAR_BUTTON_SIZE - 6, def.name, {
        font: '7px ui-monospace',
        color: this.isLocked ? '#404050' : '#a0a0b8',
      })
      .setOrigin(0.5);

    if (isWeapon && !this.isLocked && def.id !== 'grinder') {
      const initialCount = gameplayState.weaponCount(def.id);
      this.countText = scene.add
        .text(x + BAR_BUTTON_SIZE - 4, y + 3, `×${initialCount}`, {
          font: 'bold 9px ui-monospace',
          color: '#b0ffa8',
        })
        .setOrigin(1, 0)
        .setVisible(initialCount > 0);
    } else {
      this.countText = null;
    }
  }

  setSelected(selected: boolean): void {
    if (this.isLocked) return;
    this.bg.setStrokeStyle(selected ? 2 : 1, selected ? 0xff6666 : 0x4a4a5c);
    this.bg.setFillStyle(selected ? 0x2a1a1a : 0x202030);
  }

  updateCount(count: number): void {
    if (!this.countText) return;
    this.countText.setText(`×${count}`);
    this.countText.setVisible(count > 0);
  }
}

// ── SubPanel ─────────────────────────────────────────────────────────────

class SubPanel {
  private container: Phaser.GameObjects.Container;
  private upgradeButtons: UpgradeButton[] = [];
  private buyButton: Phaser.GameObjects.Rectangle | null = null;
  private sellButton: Phaser.GameObjects.Rectangle | null = null;
  private buyText: Phaser.GameObjects.Text | null = null;
  private sellText: Phaser.GameObjects.Text | null = null;
  private headerText: Phaser.GameObjects.Text;
  private cwButton: Phaser.GameObjects.Rectangle | null = null;
  private ccwButton: Phaser.GameObjects.Rectangle | null = null;
  private cwText: Phaser.GameObjects.Text | null = null;
  private ccwText: Phaser.GameObjects.Text | null = null;

  constructor(
    scene: Phaser.Scene,
    private readonly def: WeaponTypeDef | CategoryDef,
    private readonly isWeapon: boolean,
  ) {
    this.container = scene.add.container(SUBPANEL_X, BAR_Y);
    let yOff = 0;

    // Background panel.
    const bgH = this.estimateHeight();
    const bg = scene.add
      .rectangle(0, 0, SUBPANEL_W, bgH, 0x1a1a28, 0.92)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x3a3a4c);
    this.container.add(bg);
    yOff += 8;

    // Header.
    this.headerText = scene.add.text(8, yOff, def.name, {
      font: 'bold 12px ui-monospace',
      color: '#e8e8f0',
    });
    this.container.add(this.headerText);
    yOff += 22;

    // Buy/Sell for weapons (not grinder — it IS the death line).
    const showBuySell = isWeapon && def.id !== 'grinder';
    if (showBuySell) {
      const btnW = (SUBPANEL_W - 22) / 2;
      const btnH = 30;

      this.buyButton = scene.add
        .rectangle(8, yOff, btnW, btnH, 0x233024)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x4a5c4a)
        .setInteractive({ useHandCursor: true });
      this.buyText = scene.add
        .text(8 + btnW / 2, yOff + btnH / 2, 'Buy $1', {
          font: 'bold 10px ui-monospace',
          color: '#b0ffa8',
        })
        .setOrigin(0.5);
      this.buyButton.on('pointerdown', () => this.onBuy());
      this.container.add([this.buyButton, this.buyText]);

      this.sellButton = scene.add
        .rectangle(8 + btnW + 6, yOff, btnW, btnH, 0x302323)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x5c4a4a)
        .setInteractive({ useHandCursor: true });
      this.sellText = scene.add
        .text(8 + btnW + 6 + btnW / 2, yOff + btnH / 2, 'Sell $1', {
          font: 'bold 10px ui-monospace',
          color: '#ffa0a0',
        })
        .setOrigin(0.5);
      this.sellButton.on('pointerdown', () => this.onSell());
      this.container.add([this.sellButton, this.sellText]);

      yOff += btnH + 8;

      // CW/CCW toggle (saw only).
      if (def.id === 'saw') {
        const toggleW = (SUBPANEL_W - 22) / 2;
        const toggleH = 24;

        this.cwButton = scene.add
          .rectangle(8, yOff, toggleW, toggleH, 0x2a3040)
          .setOrigin(0, 0)
          .setStrokeStyle(1, 0x4a5c6a)
          .setInteractive({ useHandCursor: true });
        this.cwText = scene.add
          .text(8 + toggleW / 2, yOff + toggleH / 2, 'CW', {
            font: 'bold 10px ui-monospace',
            color: '#a0c0e0',
          })
          .setOrigin(0.5);
        this.cwButton.on('pointerdown', () => gameplayState.setSawClockwise(true));
        this.container.add([this.cwButton, this.cwText]);

        this.ccwButton = scene.add
          .rectangle(8 + toggleW + 6, yOff, toggleW, toggleH, 0x1a1a28)
          .setOrigin(0, 0)
          .setStrokeStyle(1, 0x3a3a4c)
          .setInteractive({ useHandCursor: true });
        this.ccwText = scene.add
          .text(8 + toggleW + 6 + toggleW / 2, yOff + toggleH / 2, 'CCW', {
            font: 'bold 10px ui-monospace',
            color: '#606078',
          })
          .setOrigin(0.5);
        this.ccwButton.on('pointerdown', () => gameplayState.setSawClockwise(false));
        this.container.add([this.ccwButton, this.ccwText]);

        yOff += toggleH + 6;
      }
    }

    // Upgrades.
    if (def.upgrades.length > 0) {
      const upgLabel = scene.add.text(8, yOff, 'UPGRADES', {
        font: 'bold 9px ui-monospace',
        color: '#a0a0b8',
      });
      this.container.add(upgLabel);
      yOff += 16;

      for (const upgDef of def.upgrades) {
        const btn = new UpgradeButton(scene, 8, yOff, SUBPANEL_W - 16, 40, upgDef, this.container);
        this.upgradeButtons.push(btn);
        yOff += 44;
      }
    }
  }

  refresh(): void {
    if (this.isWeapon) {
      const wDef = this.def as WeaponTypeDef;
      const count = gameplayState.weaponCount(wDef.id);
      this.headerText.setText(wDef.id === 'grinder' ? wDef.name : `${wDef.name} ×${count}`);
      const buyCost = count + 1;
      this.buyText?.setText(`Buy $${buyCost}`);
      const canBuy = gameplayState.cash >= buyCost;
      this.buyButton?.setFillStyle(canBuy ? 0x233024 : 0x1a1a20);
      this.buyText?.setColor(canBuy ? '#b0ffa8' : '#606068');

      const canSell = count > 1;
      this.sellButton?.setFillStyle(canSell ? 0x302323 : 0x1a1a20);
      this.sellText?.setColor(canSell ? '#ffa0a0' : '#606068');
      if (canSell) {
        this.sellButton?.setInteractive({ useHandCursor: true });
      } else {
        this.sellButton?.disableInteractive();
      }
    }
    // CW/CCW toggle highlight.
    if (this.cwButton) {
      const cw = gameplayState.sawClockwise;
      this.cwButton.setFillStyle(cw ? 0x2a3040 : 0x1a1a28);
      this.cwButton.setStrokeStyle(1, cw ? 0x4a5c6a : 0x3a3a4c);
      this.cwText?.setColor(cw ? '#a0c0e0' : '#606078');
      this.ccwButton?.setFillStyle(cw ? 0x1a1a28 : 0x2a3040);
      this.ccwButton?.setStrokeStyle(1, cw ? 0x3a3a4c : 0x4a5c6a);
      this.ccwText?.setColor(cw ? '#606078' : '#a0c0e0');
    }

    for (const btn of this.upgradeButtons) btn.refresh();
  }

  destroy(): void {
    this.container.destroy();
  }

  private estimateHeight(): number {
    let h = 8 + 22; // padding + header
    if (this.isWeapon && this.def.id !== 'grinder') h += 38; // buy/sell row
    if (this.def.id === 'saw') h += 30; // CW/CCW toggle
    if (this.def.upgrades.length > 0) {
      h += 16; // upgrades label
      h += this.def.upgrades.length * 44; // upgrade rows
    }
    return h + 8; // bottom padding
  }

  private onBuy(): void {
    const wDef = this.def as WeaponTypeDef;
    const count = gameplayState.weaponCount(wDef.id);
    const cost = count + 1;
    if (gameplayState.trySpend(cost)) {
      gameplayState.buyWeapon(wDef.id);
    }
  }

  private onSell(): void {
    const wDef = this.def as WeaponTypeDef;
    if (gameplayState.sellWeapon(wDef.id)) {
      gameplayState.addCash(1, { silent: true });
    }
  }
}

// ── UpgradeButton ────────────────────────────────────────────────────────

class UpgradeButton {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly statsText: Phaser.GameObjects.Text;
  private readonly descText: Phaser.GameObjects.Text;
  private hovered = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    w: number,
    h: number,
    private readonly def: UpgradeDef,
    container: Phaser.GameObjects.Container,
  ) {
    this.bg = scene.add
      .rectangle(x, y, w, h, 0x202030)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x4a4a5c);
    this.bg.setInteractive({ useHandCursor: true });
    this.bg.on('pointerdown', () => this.tryBuy());
    this.bg.on('pointerover', () => {
      this.hovered = true;
      this.applyFill();
    });
    this.bg.on('pointerout', () => {
      this.hovered = false;
      this.applyFill();
    });

    this.nameText = scene.add.text(x + 8, y + 4, def.name, {
      font: 'bold 11px ui-monospace',
      color: '#e8e8f0',
    });
    this.statsText = scene.add.text(x + 8, y + 18, '', {
      font: '9px ui-monospace',
      color: '#a0a0b8',
    });
    this.descText = scene.add.text(x + 8, y + 28, def.description, {
      font: '9px ui-monospace',
      color: '#707088',
    });

    container.add([this.bg, this.nameText, this.statsText, this.descText]);
  }

  refresh(): void {
    const level = gameplayState.levelOf(this.def.id);
    const maxed = isMaxed(this.def, level);
    if (maxed) {
      this.statsText.setText(`Lv ${level}/${this.def.maxLevel}  ·  MAX`);
      this.bg.disableInteractive();
    } else {
      const cost = costAtLevel(this.def, level);
      this.statsText.setText(`Lv ${level}/${this.def.maxLevel}  ·  $${cost}`);
      this.bg.setInteractive({ useHandCursor: true });
    }
    this.applyFill();
  }

  private applyFill(): void {
    const level = gameplayState.levelOf(this.def.id);
    const maxed = isMaxed(this.def, level);
    if (maxed) {
      this.bg.setFillStyle(0x141420);
      this.nameText.setColor('#606078');
      this.statsText.setColor('#606078');
      this.descText.setColor('#4a4a5c');
      return;
    }
    const cost = costAtLevel(this.def, level);
    const canAfford = gameplayState.cash >= cost;
    const base = canAfford ? 0x233024 : 0x202030;
    const hover = canAfford ? 0x2d3e2f : 0x2a2a3c;
    this.bg.setFillStyle(this.hovered ? hover : base);
    this.nameText.setColor('#e8e8f0');
    this.statsText.setColor(canAfford ? '#b0ffa8' : '#c08080');
    this.descText.setColor('#707088');
  }

  private tryBuy(): void {
    const level = gameplayState.levelOf(this.def.id);
    if (isMaxed(this.def, level)) return;
    const cost = costAtLevel(this.def, level);
    if (gameplayState.trySpend(cost)) {
      gameplayState.setLevel(this.def.id, level + 1);
    }
  }
}

// ── OptionsModal ─────────────────────────────────────────────────────────

class OptionsModal {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private confirmLayer: Phaser.GameObjects.GameObject[] | null = null;

  constructor(private readonly scene: UIScene) {
    const { width, height } = scene.scale;
    const backdrop = scene.add
      .rectangle(0, 0, width, height, 0x000000, 0.55)
      .setOrigin(0, 0)
      .setInteractive()
      .setDepth(800);
    backdrop.on('pointerdown', () => scene.closeOptions());
    this.objects.push(backdrop);

    const panelW = 360;
    const panelH = 300;
    const panelX = width / 2;
    const panelY = height / 2;
    const panel = scene.add
      .rectangle(panelX, panelY, panelW, panelH, 0x1f1f30)
      .setStrokeStyle(2, 0xffffff, 0.3)
      .setDepth(801)
      .setInteractive();
    // Swallow clicks on the panel itself (don't bubble to backdrop).
    panel.on('pointerdown', (_: unknown, __: unknown, ___: unknown, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
    });
    this.objects.push(panel);

    const title = scene.add
      .text(panelX, panelY - panelH / 2 + 22, 'Options', {
        font: 'bold 20px ui-monospace',
        color: '#ffd166',
      })
      .setOrigin(0.5)
      .setDepth(802);
    this.objects.push(title);

    const btnW = 220;
    const btnH = 40;
    const gap = 12;
    const firstY = panelY - 50;

    this.addButton(panelX, firstY, btnW, btnH, 'Save Now', '#b0ffa8', () => {
      scene.doManualSave();
    });
    this.addButton(panelX, firstY + (btnH + gap), btnW, btnH, () => {
      return scene.getDebugEnabled() ? 'Hide Debug Overlay' : 'Show Debug Overlay';
    }, '#a0c0e0', () => {
      scene.doToggleDebug();
      // Re-render to update button label.
      scene.closeOptions();
      scene.openOptions();
    });
    this.addButton(panelX, firstY + 2 * (btnH + gap), btnW, btnH, 'Restart Game', '#ffa0a0', () => {
      this.showRestartConfirm();
    });
    this.addButton(panelX, firstY + 3 * (btnH + gap), btnW, btnH, 'Close', '#c0c0d8', () => {
      scene.closeOptions();
    });
  }

  private addButton(
    cx: number, cy: number, w: number, h: number,
    label: string | (() => string),
    color: string,
    onClick: () => void,
  ): void {
    const bg = this.scene.add
      .rectangle(cx, cy, w, h, 0x2a2a3c)
      .setStrokeStyle(1, 0x4a4a5c)
      .setInteractive({ useHandCursor: true })
      .setDepth(802);
    const text = this.scene.add
      .text(cx, cy, typeof label === 'function' ? label() : label, {
        font: 'bold 14px ui-monospace',
        color,
      })
      .setOrigin(0.5)
      .setDepth(803);

    bg.on('pointerover', () => bg.setFillStyle(0x353550));
    bg.on('pointerout', () => bg.setFillStyle(0x2a2a3c));
    bg.on('pointerdown', (_: unknown, __: unknown, ___: unknown, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      onClick();
    });

    this.objects.push(bg, text);
  }

  private showRestartConfirm(): void {
    if (this.confirmLayer) return;
    const { width, height } = this.scene.scale;
    const layer: Phaser.GameObjects.GameObject[] = [];

    const shade = this.scene.add
      .rectangle(0, 0, width, height, 0x000000, 0.4)
      .setOrigin(0, 0)
      .setInteractive()
      .setDepth(900);
    shade.on('pointerdown', (_: unknown, __: unknown, ___: unknown, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
    });
    layer.push(shade);

    const panelW = 380;
    const panelH = 180;
    const panel = this.scene.add
      .rectangle(width / 2, height / 2, panelW, panelH, 0x1f1f30)
      .setStrokeStyle(2, 0xff6666, 0.5)
      .setDepth(901);
    layer.push(panel);

    const title = this.scene.add
      .text(width / 2, height / 2 - 50, 'Restart game?', {
        font: 'bold 18px ui-monospace',
        color: '#ff9090',
      })
      .setOrigin(0.5)
      .setDepth(902);
    layer.push(title);

    const body = this.scene.add
      .text(
        width / 2,
        height / 2 - 18,
        'This clears your save and starts fresh.',
        {
          font: '13px ui-monospace',
          color: '#c0c0d0',
          align: 'center',
        },
      )
      .setOrigin(0.5)
      .setDepth(902);
    layer.push(body);

    const cancelBg = this.scene.add
      .rectangle(width / 2 - 85, height / 2 + 40, 140, 36, 0x2a2a3c)
      .setStrokeStyle(1, 0x4a4a5c)
      .setInteractive({ useHandCursor: true })
      .setDepth(902);
    const cancelText = this.scene.add
      .text(width / 2 - 85, height / 2 + 40, 'Cancel', {
        font: 'bold 13px ui-monospace',
        color: '#c0c0d8',
      })
      .setOrigin(0.5)
      .setDepth(903);
    cancelBg.on('pointerdown', (_: unknown, __: unknown, ___: unknown, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      this.dismissConfirm();
    });
    layer.push(cancelBg, cancelText);

    const confirmBg = this.scene.add
      .rectangle(width / 2 + 85, height / 2 + 40, 140, 36, 0x402020)
      .setStrokeStyle(1, 0x803030)
      .setInteractive({ useHandCursor: true })
      .setDepth(902);
    const confirmText = this.scene.add
      .text(width / 2 + 85, height / 2 + 40, 'Restart', {
        font: 'bold 13px ui-monospace',
        color: '#ffa0a0',
      })
      .setOrigin(0.5)
      .setDepth(903);
    confirmBg.on('pointerdown', (_: unknown, __: unknown, ___: unknown, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      this.scene.doRestart();
    });
    layer.push(confirmBg, confirmText);

    this.confirmLayer = layer;
  }

  private dismissConfirm(): void {
    if (!this.confirmLayer) return;
    for (const o of this.confirmLayer) o.destroy();
    this.confirmLayer = null;
  }

  destroy(): void {
    this.dismissConfirm();
    for (const o of this.objects) o.destroy();
    this.objects.length = 0;
  }
}
