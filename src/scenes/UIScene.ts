import Phaser from 'phaser';
import { gameplayState } from '../game/gameplayState';
import {
  WEAPON_TYPES,
  CATEGORY_DEFS,
  weaponBuyCost,
  type WeaponTypeDef,
  type CategoryDef,
} from '../game/weaponCatalog';
import { costAtLevel, isMaxed, type UpgradeDef } from '../game/upgradeCatalog';
import { prestigeState } from '../game/prestigeState';
import { PRESTIGE_SHOP, shopCostAtLevel, isShopMaxed } from '../game/prestigeShopCatalog';
import type { GameScene } from './GameScene';

const BAR_X = 16;
const BAR_Y = 88;
const BAR_BUTTON_SIZE = 104;
const BAR_GAP = 12;
const SUBPANEL_X = BAR_X + BAR_BUTTON_SIZE + 12;
const SUBPANEL_W = 340;

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
  private fullscreenKey: Phaser.Input.Keyboard.Key | null = null;
  private shardsText: Phaser.GameObjects.Text | null = null;
  private prestigeModal: Phaser.GameObjects.Container | null = null;
  private prestigeShopContainer: Phaser.GameObjects.Container | null = null;
  private runConfigContainer: Phaser.GameObjects.Container | null = null;
  private seedInputEl: HTMLInputElement | null = null;

  constructor() {
    super('ui');
  }

  create(): void {
    // Seed from current state — GameScene's loadSnapshot fires cashChanged
    // before UIScene is launched, so a cold subscription would miss it.
    this.cashText = this.add.text(BAR_X, 20, `$${gameplayState.cash}`, {
      font: 'bold 52px ui-monospace',
      color: '#ffd166',
    });

    this.buildWeaponBar();
    this.buildOptionsGear();
    this.buildBottomBar();

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
    this.unsubs.push(prestigeState.on('shardsChanged', () => this.refreshBottomBar()));
    this.unsubs.push(prestigeState.on('prestigeRegistered', () => this.refreshBottomBar()));
    const gs = this.scene.get('game') as Phaser.Scene;
    const pendingHandler = (): void => this.refreshBottomBar();
    gs.events.on('pendingShardsChanged', pendingHandler);
    this.unsubs.push(() => gs.events.off('pendingShardsChanged', pendingHandler));

    // Weapon picker: GameScene emits 'open-weapon-picker' on slot click; the
    // modal here emits 'install-weapon' which GameScene consumes.
    const openPicker = (payload: { slotId: string; x: number; y: number }): void =>
      this.openWeaponPicker(payload);
    this.events.on('open-weapon-picker', openPicker);
    this.unsubs.push(() => this.events.off('open-weapon-picker', openPicker));

    // Left-click on an installed weapon sprite → open its upgrade subpanel.
    const openWeaponPanel = (typeId: string): void => {
      const def = WEAPON_TYPES.find((w) => w.id === typeId);
      if (!def) return;
      if (this.activePanel && this.selectedId === typeId) return; // already open
      this.togglePanel(typeId, def, true);
    };
    this.events.on('open-weapon-panel', openWeaponPanel);
    this.unsubs.push(() => this.events.off('open-weapon-panel', openWeaponPanel));

    // Right-click on a weapon → confirm-sell dialog.
    const openSellConfirm = (p: { slotId: string | null; typeId: string; instanceId: string }): void => {
      if (!p.slotId) return;
      this.openSellConfirm(p.slotId, p.typeId);
    };
    this.events.on('open-sell-confirm', openSellConfirm);
    this.unsubs.push(() => this.events.off('open-sell-confirm', openSellConfirm));

    this.events.once('shutdown', () => {
      for (const u of this.unsubs) u();
      this.unsubs = [];
      if (this.seedInputEl) {
        this.seedInputEl.remove();
        this.seedInputEl = null;
      }
      if (this.escKey) {
        this.escKey.removeAllListeners();
        this.input.keyboard?.removeKey(this.escKey);
        this.escKey = null;
      }
      if (this.fullscreenKey) {
        this.fullscreenKey.removeAllListeners();
        this.input.keyboard?.removeKey(this.fullscreenKey);
        this.fullscreenKey = null;
      }
    });

    const award = (this.game.registry.get('offlineAward') as number | undefined) ?? 0;
    const elapsed = (this.game.registry.get('offlineElapsedMs') as number | undefined) ?? 0;
    if (award > 0 && elapsed > 0) {
      this.showWelcomeBack(award, elapsed);
      this.game.registry.set('offlineAward', 0);
      this.game.registry.set('offlineElapsedMs', 0);
    }

    const wipedReason = this.game.registry.get('saveWipedReason') as string | null;
    if (wipedReason) {
      this.showWipeToast(wipedReason, 5000);
      this.game.registry.set('saveWipedReason', null);
    }
  }

  private showWipeToast(message: string, durationMs: number): void {
    const { width } = this.scale;
    const toast = this.add
      .text(width / 2, 48, message, {
        font: 'bold 24px ui-monospace',
        color: '#ffd166',
        backgroundColor: '#000000cc',
        padding: { x: 20, y: 12 },
      })
      .setOrigin(0.5, 0)
      .setDepth(3000);
    this.time.delayedCall(durationMs, () => {
      this.tweens.add({
        targets: toast,
        alpha: 0,
        duration: 500,
        onComplete: () => toast.destroy(),
      });
    });
  }

  private welcomeBackLayer: Phaser.GameObjects.GameObject[] | null = null;

  private showWelcomeBack(award: number, elapsedMs: number): void {
    this.dismissWelcomeBack();
    const { width, height } = this.scale;
    const layer: Phaser.GameObjects.GameObject[] = [];
    const overlay = this.add
      .rectangle(0, 0, width, height, 0x000000, 0.65)
      .setOrigin(0, 0)
      .setInteractive()
      .setDepth(1000);
    const panelW = 880;
    const panelH = 440;
    const panel = this.add
      .rectangle(width / 2, height / 2, panelW, panelH, 0x1f1f30)
      .setStrokeStyle(4, 0xffffff, 0.3)
      .setDepth(1001);

    const hours = Math.floor(elapsedMs / 3_600_000);
    const minutes = Math.floor((elapsedMs % 3_600_000) / 60_000);
    const away = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

    const title = this.add
      .text(width / 2, height / 2 - 140, 'Welcome back!', {
        fontFamily: 'sans-serif',
        fontSize: '56px',
        color: '#ffd166',
      })
      .setOrigin(0.5)
      .setDepth(1002);

    const body = this.add
      .text(
        width / 2,
        height / 2 - 30,
        `Away for ${away}.\nYour saws earned $${award.toLocaleString()}.`,
        {
          fontFamily: 'sans-serif',
          fontSize: '36px',
          color: '#cccccc',
          align: 'center',
        },
      )
      .setOrigin(0.5)
      .setDepth(1002);

    const btn = this.add
      .rectangle(width / 2, height / 2 + 120, 320, 88, 0x2d7a3d)
      .setStrokeStyle(4, 0xffffff, 0.5)
      .setInteractive({ useHandCursor: true })
      .setDepth(1002);
    const btnText = this.add
      .text(width / 2, height / 2 + 120, 'Collect', {
        fontFamily: 'sans-serif',
        fontSize: '40px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(1003);

    layer.push(overlay, panel, title, body, btn, btnText);

    btn.on('pointerdown', () => {
      // Silent: offline award is not organic earnings — don't let it spike
      // the rolling cash-rate EMA, which would inflate the next offline payout.
      gameplayState.addCash(award, { silent: true });
      this.dismissWelcomeBack();
    });
    this.welcomeBackLayer = layer;
  }

  private dismissWelcomeBack(): void {
    if (!this.welcomeBackLayer) return;
    for (const obj of this.welcomeBackLayer) obj.destroy();
    this.welcomeBackLayer = null;
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
    this.add.text(BAR_X, y + 4, '─WEAPONS─', {
      font: 'bold 16px ui-monospace',
      color: '#606078',
    });
    y += 36;

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
    const btnSize = 68;
    const x = width - btnSize - 20;
    const y = 20;

    const bg = this.add
      .rectangle(x, y, btnSize, btnSize, 0x202030)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x4a4a5c)
      .setInteractive({ useHandCursor: true })
      .setDepth(500);
    const label = this.add
      .text(x + btnSize / 2, y + btnSize / 2, '⚙', {
        font: 'bold 40px ui-monospace',
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
      this.fullscreenKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
      this.fullscreenKey.on('down', () => this.doToggleFullscreen());
    }

    // Keep a handle in case we need to re-layout later.
    void label;
  }

  private buildBottomBar(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const BAR_H = 72;

    this.add
      .rectangle(0, H - BAR_H, W, BAR_H, 0x0c0c14, 0.9)
      .setOrigin(0, 0)
      .setDepth(50);

    this.shardsText = this.add
      .text(24, H - BAR_H + 20, '', {
        font: 'bold 30px ui-monospace',
        color: '#c9a0ff',
      })
      .setDepth(51);

    const btnW = 260;
    const btnH = 48;
    const btnX = W - btnW - 24;
    const btnY = H - BAR_H + 12;
    const btnBg = this.add
      .rectangle(btnX, btnY, btnW, btnH, 0x5a2fbe)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x8a4aee)
      .setInteractive({ useHandCursor: true })
      .setDepth(51);
    this.add
      .text(btnX + btnW / 2, btnY + btnH / 2, '🔮 Prestige →', {
        font: 'bold 24px ui-monospace',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(52);

    btnBg.on('pointerover', () => btnBg.setFillStyle(0x6a3fce));
    btnBg.on('pointerout', () => btnBg.setFillStyle(0x5a2fbe));
    btnBg.on('pointerdown', () => this.openPrestigeModal());

    this.refreshBottomBar();
  }

  private refreshBottomBar(): void {
    if (!this.shardsText) return;
    const gs = this.scene.get('game') as GameScene | null;
    const pending = gs?.getPendingShardsThisRun?.() ?? 0;
    this.shardsText.setText(`🔮 ${pending} this run  (banked: ${prestigeState.shards})`);
  }

  private openPrestigeModal(): void {
    if (this.prestigeModal) return;
    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;
    const cy = H / 2;
    const gs = this.scene.get('game') as GameScene;
    const pending = gs.getPendingShardsThisRun();

    const container = this.add.container(0, 0).setDepth(300);
    const backdrop = this.add
      .rectangle(0, 0, W, H, 0x000000, 0.7)
      .setOrigin(0, 0)
      .setInteractive();
    const panel = this.add
      .rectangle(cx, cy, 760, 460, 0x1a1a28)
      .setStrokeStyle(4, 0x5a2fbe);
    const title = this.add
      .text(cx, cy - 180, 'Prestige now?', { font: 'bold 48px ui-monospace', color: '#ffffff' })
      .setOrigin(0.5);
    const body1 = this.add
      .text(cx, cy - 90, 'Resets: cash, in-run upgrades,\nall placed weapons.', {
        font: '26px ui-monospace', color: '#d0d0e0', align: 'center',
      })
      .setOrigin(0.5);
    const body2 = this.add
      .text(cx, cy + 10, 'Keeps: 🔮 Shards + Prestige Shop.', {
        font: '26px ui-monospace', color: '#d0d0e0',
      })
      .setOrigin(0.5);
    const gain = this.add
      .text(cx, cy + 80, `You will gain: 🔮 ${pending} Shards`, {
        font: 'bold 30px ui-monospace', color: '#c9a0ff',
      })
      .setOrigin(0.5);

    const cancelBg = this.add
      .rectangle(cx - 150, cy + 160, 180, 56, 0x4a4a5a)
      .setStrokeStyle(2, 0x6a6a7a)
      .setInteractive({ useHandCursor: true });
    const cancelText = this.add
      .text(cx - 150, cy + 160, 'Cancel', { font: 'bold 24px ui-monospace', color: '#ffffff' })
      .setOrigin(0.5);

    const confirmBg = this.add
      .rectangle(cx + 150, cy + 160, 180, 56, 0x5a2fbe)
      .setStrokeStyle(2, 0x8a4aee)
      .setInteractive({ useHandCursor: true });
    const confirmText = this.add
      .text(cx + 150, cy + 160, 'Prestige', { font: 'bold 24px ui-monospace', color: '#ffffff' })
      .setOrigin(0.5);

    container.add([backdrop, panel, title, body1, body2, gain, cancelBg, cancelText, confirmBg, confirmText]);
    this.prestigeModal = container;

    cancelBg.on('pointerdown', () => this.closePrestigeModal());
    confirmBg.on('pointerdown', () => {
      this.closePrestigeModal();
      gs.confirmPrestige();
      this.openPrestigeShop();
    });
  }

  private closePrestigeModal(): void {
    this.prestigeModal?.destroy();
    this.prestigeModal = null;
  }

  private openPrestigeShop(): void {
    if (this.prestigeShopContainer) return;
    const W = this.scale.width;
    const H = this.scale.height;
    const container = this.add.container(0, 0).setDepth(300);
    const backdrop = this.add
      .rectangle(0, 0, W, H, 0x000000, 0.94)
      .setOrigin(0, 0)
      .setInteractive();
    const title = this.add
      .text(W / 2, 60, 'Prestige Shop', { font: 'bold 48px ui-monospace', color: '#ffffff' })
      .setOrigin(0.5);
    const shardsHeader = this.add
      .text(W / 2, 120, '', { font: 'bold 32px ui-monospace', color: '#c9a0ff' })
      .setOrigin(0.5);
    container.add([backdrop, title, shardsHeader]);

    const FAMILY_HEADERS: Array<['free-weapon' | 'multiplier' | 'material' | 'economy', string]> = [
      ['free-weapon', 'FREE WEAPONS'],
      ['multiplier', 'MULTIPLIERS'],
      ['material', 'MATERIAL'],
      ['economy', 'ECONOMY'],
    ];

    const rowRefreshers: Array<() => void> = [];
    const refreshHeader = (): void => {
      shardsHeader.setText(`Banked: 🔮 ${prestigeState.shards}`);
      for (const r of rowRefreshers) r();
    };

    let y = 190;
    const leftX = W / 2 - 560;
    const rightX = W / 2 + 360;
    for (const [family, headerLabel] of FAMILY_HEADERS) {
      const header = this.add
        .text(leftX, y, headerLabel, { font: 'bold 26px ui-monospace', color: '#9090c8' });
      container.add(header);
      y += 42;
      for (const entry of PRESTIGE_SHOP.filter((e) => e.family === family)) {
        const rowY = y;
        const label = this.add.text(leftX, rowY, '', {
          font: '22px ui-monospace', color: '#ffffff', wordWrap: { width: 880 },
        });
        const btnBg = this.add
          .rectangle(rightX, rowY - 4, 180, 44, 0x5a2fbe)
          .setOrigin(0, 0)
          .setStrokeStyle(2, 0x8a4aee)
          .setInteractive({ useHandCursor: true });
        const btnText = this.add
          .text(rightX + 90, rowY + 18, '', { font: 'bold 22px ui-monospace', color: '#ffffff' })
          .setOrigin(0.5);

        const refreshRow = (): void => {
          const lv = prestigeState.shopLevel(entry.id);
          const maxed = isShopMaxed(entry, lv);
          const cost = maxed ? 0 : shopCostAtLevel(entry, lv);
          const maxPart = Number.isFinite(entry.maxLevel) ? ` / ${entry.maxLevel}` : '';
          label.setText(`${entry.name}  ·  Lv ${lv}${maxPart}  ·  ${entry.description}`);
          if (maxed) {
            btnText.setText('MAX');
            btnBg.setFillStyle(0x404050).disableInteractive();
          } else {
            btnText.setText(`🔮 ${cost}`);
            if (prestigeState.shards >= cost) {
              btnBg.setFillStyle(0x5a2fbe).setInteractive({ useHandCursor: true });
            } else {
              btnBg.setFillStyle(0x2a1a4a).setInteractive({ useHandCursor: true });
            }
          }
        };
        rowRefreshers.push(refreshRow);

        btnBg.on('pointerdown', () => {
          const lv = prestigeState.shopLevel(entry.id);
          if (isShopMaxed(entry, lv)) return;
          const cost = shopCostAtLevel(entry, lv);
          if (!prestigeState.trySpend(cost)) return;
          prestigeState.setShopLevel(entry.id, lv + 1);
          refreshHeader();
        });

        container.add([label, btnBg, btnText]);
        y += 50;
      }
      y += 24;
    }

    const nextBtn = this.add
      .rectangle(W / 2, H - 90, 340, 60, 0x3a7aff)
      .setStrokeStyle(2, 0x5a9aff)
      .setInteractive({ useHandCursor: true });
    const nextText = this.add
      .text(W / 2, H - 90, 'Next → Run Config', { font: 'bold 28px ui-monospace', color: '#ffffff' })
      .setOrigin(0.5);
    nextBtn.on('pointerdown', () => {
      this.closePrestigeShop();
      this.openRunConfig();
    });
    container.add([nextBtn, nextText]);

    refreshHeader();
    this.prestigeShopContainer = container;
  }

  private closePrestigeShop(): void {
    this.prestigeShopContainer?.destroy();
    this.prestigeShopContainer = null;
  }

  private runConfigDomLayer: HTMLDivElement | null = null;

  // DOM modals must live inside the currently-fullscreen subtree (when the
  // game is fullscreened on the `#game` div), otherwise the browser hides
  // them entirely. Falls back to document.body in windowed mode.
  private modalParent(): HTMLElement {
    return (document.fullscreenElement as HTMLElement | null) ?? document.body;
  }

  private openRunConfig(): void {
    if (this.runConfigContainer || this.runConfigDomLayer) return;
    this.dismissWelcomeBack();
    this.dismissWeaponPicker();
    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;
    const DEPTH = 8000;
    const container = this.add.container(0, 0).setDepth(DEPTH);
    const backdrop = this.add
      .rectangle(0, 0, W, H, 0x000000, 0.97)
      .setOrigin(0, 0)
      .setDepth(DEPTH);
    const title = this.add
      .text(cx, 220, 'Run Config', { font: 'bold 48px ui-monospace', color: '#ffffff' })
      .setOrigin(0.5)
      .setDepth(DEPTH + 1);
    const seedLabel = this.add
      .text(cx, 330, 'Seed:', { font: '28px ui-monospace', color: '#d0d0e0' })
      .setOrigin(0.5)
      .setDepth(DEPTH + 1);
    container.add([backdrop, title, seedLabel]);
    this.runConfigContainer = container;

    // DOM layer: seed input + re-roll + Start Run. Phaser canvas input has
    // been unreliable for modal buttons inside containers — going through
    // DOM bypasses the routing entirely. Positioned absolutely over the
    // canvas, z-index 999 ensures it's above everything.
    const layer = document.createElement('div');
    layer.style.cssText =
      'position:absolute; inset:0; z-index:999; pointer-events:none; ' +
      'display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px;';

    const row = document.createElement('div');
    row.style.cssText = 'display:flex; gap:12px; pointer-events:auto; align-items:center;';

    const defaultSeed = `cosmic-dust-${Date.now().toString(36)}`;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = defaultSeed;
    input.style.cssText =
      'font-size:22px; padding:10px 16px; width:520px; border-radius:6px; ' +
      'border:2px solid #555; background:#f5f5f5; color:#111;';
    this.seedInputEl = input;

    const reroll = document.createElement('button');
    reroll.textContent = '🎲 Re-roll';
    reroll.style.cssText =
      'font:bold 22px ui-monospace; padding:12px 20px; border-radius:6px; ' +
      'background:#4a4a5a; color:#fff; border:2px solid #6a6a7a; cursor:pointer;';
    reroll.addEventListener('click', () => {
      input.value = `cosmic-dust-${Date.now().toString(36)}`;
    });

    row.appendChild(input);
    row.appendChild(reroll);

    const start = document.createElement('button');
    start.textContent = '🚀 Start Run';
    start.style.cssText =
      'font:bold 32px ui-monospace; padding:18px 44px; border-radius:8px; ' +
      'background:#3a7aff; color:#fff; border:2px solid #5a9aff; cursor:pointer; ' +
      'margin-top:40px; pointer-events:auto;';
    start.addEventListener('click', () => {
      const seed = input.value || defaultSeed;
      this.closeRunConfig();
      const gs = this.scene.get('game') as GameScene;
      gs.startNewRun(seed);
    });

    layer.appendChild(row);
    layer.appendChild(start);
    this.modalParent().appendChild(layer);
    this.runConfigDomLayer = layer;
  }

  private closeRunConfig(): void {
    if (this.runConfigDomLayer) {
      this.runConfigDomLayer.remove();
      this.runConfigDomLayer = null;
    }
    // The DOM input was a child of runConfigDomLayer, so remove() above
    // already detached it. Null the reference.
    this.seedInputEl = null;
    this.runConfigContainer?.destroy();
    this.runConfigContainer = null;
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

  doToggleFullscreen(): void {
    if (this.scale.isFullscreen) this.scale.stopFullscreen();
    else this.scale.startFullscreen();
  }

  getFullscreenEnabled(): boolean {
    return this.scale.isFullscreen;
  }

  private flashSaveToast(): void {
    if (this.saveToastTween) {
      this.saveToastTween.stop();
      this.saveToastTween = null;
    }
    if (!this.saveToast) {
      this.saveToast = this.add
        .text(this.scale.width - 20, 104, 'Saved', {
          font: 'bold 28px ui-monospace',
          color: '#b0ffa8',
          backgroundColor: '#00000080',
          padding: { x: 16, y: 8 },
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

  // ── weapon picker (slot install) ─────────────────────────────────────
  // Implemented as a DOM overlay (not Phaser canvas objects) so clicks are
  // handled by the browser's native event system. Phaser's multi-scene input
  // routing was eating picker clicks under certain conditions.

  private weaponPickerDomLayer: HTMLDivElement | null = null;

  private openWeaponPicker(payload: { slotId: string; x: number; y: number }): void {
    this.dismissWeaponPicker();
    this.dismissWelcomeBack();

    const backdrop = document.createElement('div');
    backdrop.style.cssText =
      'position:absolute; inset:0; z-index:1200; background:rgba(0,0,0,0.55); ' +
      'display:flex; align-items:center; justify-content:center; pointer-events:auto;';
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) this.dismissWeaponPicker();
    });

    const panel = document.createElement('div');
    panel.style.cssText =
      'background:#18182a; border:2px solid #3a3a4c; border-radius:8px; padding:28px; ' +
      'min-width:460px; color:#eee; font-family:ui-monospace; display:flex; flex-direction:column; gap:16px;';

    const title = document.createElement('div');
    title.textContent = 'Install Weapon';
    title.style.cssText = 'font:bold 28px ui-monospace; color:#f5d66d; text-align:center;';
    panel.appendChild(title);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:12px;';
    const categories = WEAPON_TYPES.filter((w) => !w.locked && w.id !== 'grinder');
    for (const wt of categories) {
      const bought = gameplayState.instancesBoughtThisRun(wt.id);
      const freeSlots = prestigeState.shopLevels()[`free.${wt.id}`] ?? 0;
      const cost = weaponBuyCost({ boughtThisRun: bought, freeSlots, baseCost: 1 });
      const btn = document.createElement('button');
      btn.style.cssText =
        'background:#202030; border:2px solid #3a3a4c; border-radius:6px; padding:14px 10px; ' +
        'color:#eeeeff; font:bold 18px ui-monospace; cursor:pointer; display:flex; flex-direction:column; gap:6px; align-items:center;';
      const name = document.createElement('span');
      name.textContent = wt.name;
      const price = document.createElement('span');
      price.textContent = cost === 0 ? 'FREE' : `$${cost}`;
      price.style.color = cost === 0 ? '#9fe79f' : '#ffd166';
      price.style.font = '16px ui-monospace';
      btn.appendChild(name);
      btn.appendChild(price);
      btn.addEventListener('click', () => {
        this.events.emit('install-weapon', {
          slotId: payload.slotId,
          typeId: wt.id,
          x: payload.x,
          y: payload.y,
        });
        this.dismissWeaponPicker();
      });
      grid.appendChild(btn);
    }
    panel.appendChild(grid);

    const hint = document.createElement('div');
    hint.textContent = 'Click outside to cancel';
    hint.style.cssText = 'font:14px ui-monospace; color:#888899; text-align:center;';
    panel.appendChild(hint);

    backdrop.appendChild(panel);
    this.modalParent().appendChild(backdrop);
    this.weaponPickerDomLayer = backdrop;
  }

  private dismissWeaponPicker(): void {
    if (!this.weaponPickerDomLayer) return;
    this.weaponPickerDomLayer.remove();
    this.weaponPickerDomLayer = null;
  }

  // ── sell-confirm dialog ───────────────────────────────────────────────
  private sellConfirmDomLayer: HTMLDivElement | null = null;

  private openSellConfirm(slotId: string, typeId: string): void {
    this.dismissSellConfirm();
    const backdrop = document.createElement('div');
    backdrop.style.cssText =
      'position:absolute; inset:0; z-index:1300; background:rgba(0,0,0,0.55); ' +
      'display:flex; align-items:center; justify-content:center; pointer-events:auto;';
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) this.dismissSellConfirm();
    });
    const panel = document.createElement('div');
    panel.style.cssText =
      'background:#18182a; border:2px solid #5c4a4a; border-radius:8px; padding:28px; ' +
      'min-width:420px; color:#eee; font-family:ui-monospace; display:flex; flex-direction:column; gap:16px;';
    const title = document.createElement('div');
    title.textContent = 'Sell this weapon?';
    title.style.cssText = 'font:bold 28px ui-monospace; color:#ffa0a0; text-align:center;';
    panel.appendChild(title);
    const body = document.createElement('div');
    body.textContent = `Refunds $1. Frees up the slot for another buy.`;
    body.style.cssText = 'font:18px ui-monospace; color:#d0d0e0; text-align:center;';
    panel.appendChild(body);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex; gap:12px; justify-content:center;';
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    cancel.style.cssText =
      'font:bold 20px ui-monospace; padding:12px 24px; border-radius:6px; ' +
      'background:#4a4a5a; color:#fff; border:2px solid #6a6a7a; cursor:pointer;';
    cancel.addEventListener('click', () => this.dismissSellConfirm());
    const sell = document.createElement('button');
    sell.textContent = `Sell (${typeId})`;
    sell.style.cssText =
      'font:bold 20px ui-monospace; padding:12px 24px; border-radius:6px; ' +
      'background:#5c2323; color:#fff; border:2px solid #8a4040; cursor:pointer;';
    sell.addEventListener('click', () => {
      const gs = this.scene.get('game') as GameScene;
      gs.sellWeaponAt(slotId);
      this.dismissSellConfirm();
    });
    row.appendChild(cancel);
    row.appendChild(sell);
    panel.appendChild(row);
    backdrop.appendChild(panel);
    this.modalParent().appendChild(backdrop);
    this.sellConfirmDomLayer = backdrop;
  }

  private dismissSellConfirm(): void {
    if (!this.sellConfirmDomLayer) return;
    this.sellConfirmDomLayer.remove();
    this.sellConfirmDomLayer = null;
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
      .setStrokeStyle(2, 0x4a4a5c);

    if (!this.isLocked) {
      this.bg.setInteractive({ useHandCursor: true });
      this.bg.on('pointerdown', () => onClick());
    }

    // Icon placeholder — first letter of name, large.
    scene.add
      .text(x + BAR_BUTTON_SIZE / 2, y + BAR_BUTTON_SIZE / 2 - 8, def.name.charAt(0), {
        font: 'bold 40px ui-monospace',
        color: this.isLocked ? '#303040' : '#8080a0',
      })
      .setOrigin(0.5);

    scene.add
      .text(x + BAR_BUTTON_SIZE / 2, y + BAR_BUTTON_SIZE - 12, def.name, {
        font: '14px ui-monospace',
        color: this.isLocked ? '#404050' : '#a0a0b8',
      })
      .setOrigin(0.5);

    if (isWeapon && !this.isLocked && def.id !== 'grinder') {
      const initialCount = gameplayState.weaponCount(def.id);
      this.countText = scene.add
        .text(x + BAR_BUTTON_SIZE - 8, y + 6, `×${initialCount}`, {
          font: 'bold 18px ui-monospace',
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
    this.bg.setStrokeStyle(selected ? 4 : 2, selected ? 0xff6666 : 0x4a4a5c);
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
  private headerText: Phaser.GameObjects.Text;

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
      .setStrokeStyle(2, 0x3a3a4c);
    this.container.add(bg);
    yOff += 16;

    // Header.
    this.headerText = scene.add.text(16, yOff, def.name, {
      font: 'bold 24px ui-monospace',
      color: '#e8e8f0',
    });
    this.container.add(this.headerText);
    yOff += 44;
    // Buy/Sell removed — weapons are bought via the slot picker (left-click
    // on an empty unlocked slot) and sold via right-click on the weapon
    // sprite itself. This panel is pure upgrades now.

    // Upgrades.
    if (def.upgrades.length > 0) {
      const upgLabel = scene.add.text(16, yOff, 'UPGRADES', {
        font: 'bold 18px ui-monospace',
        color: '#a0a0b8',
      });
      this.container.add(upgLabel);
      yOff += 32;

      for (const upgDef of def.upgrades) {
        const btn = new UpgradeButton(scene, 16, yOff, SUBPANEL_W - 32, 80, upgDef, this.container);
        this.upgradeButtons.push(btn);
        yOff += 88;
      }
    }
  }

  refresh(): void {
    if (this.isWeapon) {
      const wDef = this.def as WeaponTypeDef;
      const count = gameplayState.weaponCount(wDef.id);
      this.headerText.setText(wDef.id === 'grinder' ? wDef.name : `${wDef.name} ×${count}`);
    }
    for (const btn of this.upgradeButtons) btn.refresh();
  }

  destroy(): void {
    this.container.destroy();
  }

  private estimateHeight(): number {
    let h = 16 + 44; // padding + header
    if (this.def.upgrades.length > 0) {
      h += 32; // upgrades label
      h += this.def.upgrades.length * 88; // upgrade rows
    }
    return h + 16; // bottom padding
  }

  // Legacy onBuy/onSell removed — buying is now the slot picker
  // (left-click on an empty unlocked slot); selling is right-click on the
  // weapon sprite on the arena, handled by GameScene.
}

// ── UpgradeButton ────────────────────────────────────────────────────────

class UpgradeButton {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly statsText: Phaser.GameObjects.Text;
  private readonly descText: Phaser.GameObjects.Text;
  private readonly scene: Phaser.Scene;
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
    this.scene = scene;
    this.bg = scene.add
      .rectangle(x, y, w, h, 0x202030)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x4a4a5c);
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

    this.nameText = scene.add.text(x + 16, y + 8, def.name, {
      font: 'bold 22px ui-monospace',
      color: '#e8e8f0',
    });
    this.statsText = scene.add.text(x + 16, y + 36, '', {
      font: '18px ui-monospace',
      color: '#a0a0b8',
    });
    this.descText = scene.add.text(x + 16, y + 56, def.description, {
      font: '18px ui-monospace',
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
      const cost = this.adjustedCost(level);
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
    const cost = this.adjustedCost(level);
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
    const cost = this.adjustedCost(level);
    if (gameplayState.trySpend(cost)) {
      gameplayState.setLevel(this.def.id, level + 1);
    }
  }

  private adjustedCost(level: number): number {
    const base = costAtLevel(this.def, level);
    const gs = this.scene.scene.get('game') as GameScene | null;
    const mult = gs?.getEffectiveParams().upgradeCostMultiplier ?? 1;
    return Math.max(1, Math.floor(base * mult));
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

    const panelW = 720;
    const panelH = 720;
    const panelX = width / 2;
    const panelY = height / 2;
    const panel = scene.add
      .rectangle(panelX, panelY, panelW, panelH, 0x1f1f30)
      .setStrokeStyle(4, 0xffffff, 0.3)
      .setDepth(801)
      .setInteractive();
    // Swallow clicks on the panel itself (don't bubble to backdrop).
    panel.on('pointerdown', (_: unknown, __: unknown, ___: unknown, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
    });
    this.objects.push(panel);

    const title = scene.add
      .text(panelX, panelY - panelH / 2 + 44, 'Options', {
        font: 'bold 40px ui-monospace',
        color: '#ffd166',
      })
      .setOrigin(0.5)
      .setDepth(802);
    this.objects.push(title);

    const btnW = 440;
    const btnH = 80;
    const gap = 24;
    const firstY = panelY - 160;

    this.addButton(panelX, firstY, btnW, btnH, 'Save Now', '#b0ffa8', () => {
      scene.doManualSave();
    });
    this.addButton(panelX, firstY + (btnH + gap), btnW, btnH, () => {
      return scene.getFullscreenEnabled() ? 'Exit Fullscreen (F)' : 'Enter Fullscreen (F)';
    }, '#ffd166', () => {
      scene.doToggleFullscreen();
      scene.closeOptions();
      scene.openOptions();
    });
    this.addButton(panelX, firstY + 2 * (btnH + gap), btnW, btnH, () => {
      return scene.getDebugEnabled() ? 'Hide Debug Overlay' : 'Show Debug Overlay';
    }, '#a0c0e0', () => {
      scene.doToggleDebug();
      scene.closeOptions();
      scene.openOptions();
    });
    this.addButton(panelX, firstY + 3 * (btnH + gap), btnW, btnH, 'Restart Game', '#ffa0a0', () => {
      this.showRestartConfirm();
    });
    this.addButton(panelX, firstY + 4 * (btnH + gap), btnW, btnH, 'Close', '#c0c0d8', () => {
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
      .setStrokeStyle(2, 0x4a4a5c)
      .setInteractive({ useHandCursor: true })
      .setDepth(802);
    const text = this.scene.add
      .text(cx, cy, typeof label === 'function' ? label() : label, {
        font: 'bold 28px ui-monospace',
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

    const panelW = 760;
    const panelH = 360;
    const panel = this.scene.add
      .rectangle(width / 2, height / 2, panelW, panelH, 0x1f1f30)
      .setStrokeStyle(4, 0xff6666, 0.5)
      .setDepth(901);
    layer.push(panel);

    const title = this.scene.add
      .text(width / 2, height / 2 - 100, 'Restart game?', {
        font: 'bold 36px ui-monospace',
        color: '#ff9090',
      })
      .setOrigin(0.5)
      .setDepth(902);
    layer.push(title);

    const body = this.scene.add
      .text(
        width / 2,
        height / 2 - 36,
        'This clears your save and starts fresh.',
        {
          font: '26px ui-monospace',
          color: '#c0c0d0',
          align: 'center',
        },
      )
      .setOrigin(0.5)
      .setDepth(902);
    layer.push(body);

    const cancelBg = this.scene.add
      .rectangle(width / 2 - 170, height / 2 + 80, 280, 72, 0x2a2a3c)
      .setStrokeStyle(2, 0x4a4a5c)
      .setInteractive({ useHandCursor: true })
      .setDepth(902);
    const cancelText = this.scene.add
      .text(width / 2 - 170, height / 2 + 80, 'Cancel', {
        font: 'bold 26px ui-monospace',
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
      .rectangle(width / 2 + 170, height / 2 + 80, 280, 72, 0x402020)
      .setStrokeStyle(2, 0x803030)
      .setInteractive({ useHandCursor: true })
      .setDepth(902);
    const confirmText = this.scene.add
      .text(width / 2 + 170, height / 2 + 80, 'Restart', {
        font: 'bold 26px ui-monospace',
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
