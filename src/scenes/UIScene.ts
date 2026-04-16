import Phaser from 'phaser';
import { gameplayState } from '../game/gameplayState';
import {
  UPGRADE_CATALOG,
  costAtLevel,
  isMaxed,
  type UpgradeCategory,
  type UpgradeDef,
} from '../game/upgradeCatalog';

const PANEL_X = 14;
const PANEL_Y = 50;
const PANEL_W = 260;
const BUTTON_H = 52;
const BUTTON_GAP = 8;

const CATEGORY_COLORS: Record<UpgradeCategory, number> = {
  saw: 0x4a3a2c,
  environment: 0x2a3a4a,
  asteroid: 0x3a2a4a,
};

export class UIScene extends Phaser.Scene {
  private cashText!: Phaser.GameObjects.Text;
  private buttons: UpgradeButton[] = [];
  private unsubs: Array<() => void> = [];

  constructor() {
    super('ui');
  }

  create(): void {
    this.cashText = this.add.text(14, 10, '$0', {
      font: 'bold 26px ui-monospace',
      color: '#ffd166',
    });

    this.add
      .text(this.scale.width / 2, 12, 'drag the stopper · chop the asteroids · keep them off the red line', {
        font: '13px ui-monospace',
        color: '#888',
      })
      .setOrigin(0.5, 0);

    this.buildUpgradePanel();

    this.unsubs.push(
      gameplayState.on('cashChanged', (cash) => {
        this.cashText.setText(`$${cash}`);
        this.tweens.add({
          targets: this.cashText,
          scale: { from: 1.15, to: 1 },
          duration: 160,
          ease: 'Quad.out',
        });
        this.refreshButtons();
      }),
    );
    this.unsubs.push(
      gameplayState.on('upgradeLevelChanged', () => {
        this.refreshButtons();
      }),
    );

    this.events.once('shutdown', () => {
      for (const u of this.unsubs) u();
      this.unsubs = [];
    });

    this.refreshButtons();
  }

  private buildUpgradePanel(): void {
    this.add
      .text(PANEL_X, PANEL_Y - 22, 'UPGRADES', {
        font: 'bold 11px ui-monospace',
        color: '#a0a0b8',
      });

    UPGRADE_CATALOG.forEach((def, i) => {
      const y = PANEL_Y + i * (BUTTON_H + BUTTON_GAP);
      this.buttons.push(new UpgradeButton(this, PANEL_X, y, PANEL_W, BUTTON_H, def));
    });
  }

  private refreshButtons(): void {
    for (const b of this.buttons) b.refresh();
  }
}

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

    // Left category stripe.
    scene.add
      .rectangle(x, y, 4, h, CATEGORY_COLORS[def.category])
      .setOrigin(0, 0)
      .setStrokeStyle(0);

    this.nameText = scene.add.text(x + 12, y + 6, def.name, {
      font: 'bold 14px ui-monospace',
      color: '#e8e8f0',
    });
    this.statsText = scene.add.text(x + 12, y + 23, '', {
      font: '11px ui-monospace',
      color: '#a0a0b8',
    });
    this.descText = scene.add.text(x + 12, y + 36, def.description, {
      font: '10px ui-monospace',
      color: '#707088',
    });
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
