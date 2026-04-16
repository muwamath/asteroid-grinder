# Phase 7 — Save & Offline Implementation Plan

**Goal:** `localStorage` autosave of gameplay state every 5s + welcome-back popup granting offline cash earned during absence.

**Architecture:** Pure-logic modules for serialization (`saveState.ts`), rolling-rate tracking (`cashRate.ts`), and offline-award calculation (`offlineProgress.ts`) — all fully unit-tested. GameScene subscribes to `cashChanged` to update an EMA of cash/sec (window τ=60s), autosaves every 5s plus on `beforeunload`. On boot, `main.ts` attempts to load; if successful AND elapsed ≥ 60s, UIScene shows a modal popup (dim overlay + text + Collect button) that grants the capped award.

**Tech Stack:** TypeScript, Phaser 3, Vitest. `localStorage` only — no server.

---

## File structure

**Create:**
- `src/game/saveState.ts` — `SaveStateV1` type, `serialize(state)`, `deserialize(json)`, `saveToLocalStorage`, `loadFromLocalStorage`. Versioned schema (v=1) with safe fallback on mismatch.
- `src/game/saveState.test.ts` — round-trip, version-mismatch → null, malformed-JSON → null, missing-key → null, legacy-shape → null.
- `src/game/cashRate.ts` — `CashRateTracker` class with `observe(earned, deltaMs)` and `rate(): number` (cash/sec). EMA formula `alpha = dt/(tau+dt)`, `tau = 60_000`. Pure, no Phaser.
- `src/game/cashRate.test.ts` — zero-start, constant-rate convergence, decay when idle.
- `src/game/offlineProgress.ts` — `computeOfflineAward({ rate, elapsedMs, capMs })`. Pure.
- `src/game/offlineProgress.test.ts` — zero-rate → 0, within-cap linear, past-cap clamped, negative/NaN → 0.

**Modify:**
- `src/game/gameplayState.ts` — add `loadSnapshot(snap)` to bulk-restore cash + levels + weaponCounts + sawClockwise (emits events so subscribers react). Add `cashEarned` event (separate from `cashChanged` — only fires on positive delta) so EMA tracker doesn't double-count spending as income.
- `src/scenes/GameScene.ts` — in `create()`, if a pending snapshot is attached to scene data, apply it via `gameplayState.loadSnapshot()` *before* `applyUpgrades()`. Start 5s autosave timer. Add `CashRateTracker` subscribed to `cashEarned`. Persist `window.beforeunload` save hook with teardown in `shutdown`.
- `src/scenes/UIScene.ts` — add `showWelcomeBack(award, elapsedMs)` modal (semi-transparent full-screen rectangle + centered panel with text + Collect button). On Collect: `addCash(award)` + hide modal.
- `src/main.ts` — on bootstrap, attempt `loadFromLocalStorage()`. If found, compute offline award using the saved `emaCashPerSec` + `savedAt`, stash `{ snapshot, award, elapsedMs }` in `game.registry` so scenes can read it. GameScene consumes snapshot; UIScene consumes award (if > 0) to show popup.

**Do not modify:** upgrade catalog, weapon catalog, physics loop, scene architecture.

---

## Data shapes

```ts
// src/game/saveState.ts
export interface SaveStateV1 {
  v: 1;
  cash: number;
  levels: Record<string, number>;
  weaponCounts: Record<string, number>;
  sawClockwise: boolean;
  emaCashPerSec: number;
  savedAt: number; // epoch ms
}

export const STORAGE_KEY = 'asteroid-grinder:save:v1';
export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000; // 8h
export const MIN_OFFLINE_MS = 60 * 1000;          // 60s threshold to show popup
```

---

### Task 1: Save schema + serialize/deserialize (pure, tested first)

**Files:**
- Create: `src/game/saveState.ts`
- Create: `src/game/saveState.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/game/saveState.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  serialize,
  deserialize,
  saveToLocalStorage,
  loadFromLocalStorage,
  STORAGE_KEY,
  type SaveStateV1,
} from './saveState';

const sample: SaveStateV1 = {
  v: 1,
  cash: 123,
  levels: { sawDamage: 2, dropRate: 1 },
  weaponCounts: { saw: 1 },
  sawClockwise: true,
  emaCashPerSec: 4.5,
  savedAt: 1_700_000_000_000,
};

describe('saveState', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips via serialize/deserialize', () => {
    const json = serialize(sample);
    expect(deserialize(json)).toEqual(sample);
  });

  it('returns null for malformed JSON', () => {
    expect(deserialize('not json')).toBeNull();
  });

  it('returns null for wrong version', () => {
    expect(deserialize(JSON.stringify({ ...sample, v: 2 }))).toBeNull();
  });

  it('returns null for missing required key', () => {
    const { cash: _c, ...rest } = sample;
    expect(deserialize(JSON.stringify(rest))).toBeNull();
  });

  it('saves and loads via localStorage', () => {
    saveToLocalStorage(sample);
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();
    expect(loadFromLocalStorage()).toEqual(sample);
  });

  it('loadFromLocalStorage returns null when empty', () => {
    expect(loadFromLocalStorage()).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect failure (module missing)**

Run: `npm test -- saveState`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement module**

```ts
// src/game/saveState.ts
export interface SaveStateV1 {
  v: 1;
  cash: number;
  levels: Record<string, number>;
  weaponCounts: Record<string, number>;
  sawClockwise: boolean;
  emaCashPerSec: number;
  savedAt: number;
}

export const STORAGE_KEY = 'asteroid-grinder:save:v1';
export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;
export const MIN_OFFLINE_MS = 60 * 1000;

export function serialize(state: SaveStateV1): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): SaveStateV1 | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Partial<SaveStateV1>;
  if (p.v !== 1) return null;
  if (typeof p.cash !== 'number') return null;
  if (!p.levels || typeof p.levels !== 'object') return null;
  if (!p.weaponCounts || typeof p.weaponCounts !== 'object') return null;
  if (typeof p.sawClockwise !== 'boolean') return null;
  if (typeof p.emaCashPerSec !== 'number') return null;
  if (typeof p.savedAt !== 'number') return null;
  return p as SaveStateV1;
}

export function saveToLocalStorage(state: SaveStateV1): void {
  try {
    localStorage.setItem(STORAGE_KEY, serialize(state));
  } catch {
    // Quota exceeded or privacy mode — silent.
  }
}

export function loadFromLocalStorage(): SaveStateV1 | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return deserialize(raw);
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- saveState`
Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add src/game/saveState.ts src/game/saveState.test.ts
git commit -m "save: serialize/deserialize v1 + localStorage helpers"
```

---

### Task 2: Rolling cash-rate tracker (EMA)

**Files:**
- Create: `src/game/cashRate.ts`
- Create: `src/game/cashRate.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/game/cashRate.test.ts
import { describe, it, expect } from 'vitest';
import { CashRateTracker } from './cashRate';

describe('CashRateTracker', () => {
  it('starts at zero', () => {
    expect(new CashRateTracker().rate()).toBe(0);
  });

  it('converges toward steady-state with repeated observations', () => {
    const t = new CashRateTracker(60_000);
    // 10 cash per 1000ms = 10 cash/sec. Feed ~120s worth.
    for (let i = 0; i < 120; i++) t.observe(10, 1000);
    expect(t.rate()).toBeGreaterThan(5);
    expect(t.rate()).toBeLessThan(15);
  });

  it('decays toward zero when idle', () => {
    const t = new CashRateTracker(60_000);
    for (let i = 0; i < 60; i++) t.observe(10, 1000);
    const before = t.rate();
    for (let i = 0; i < 300; i++) t.observe(0, 1000);
    expect(t.rate()).toBeLessThan(before);
  });

  it('restores from saved rate', () => {
    const t = new CashRateTracker(60_000, 7.5);
    expect(t.rate()).toBe(7.5);
  });

  it('ignores non-positive deltaMs', () => {
    const t = new CashRateTracker();
    t.observe(100, 0);
    t.observe(100, -5);
    expect(t.rate()).toBe(0);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `npm test -- cashRate`
Expected: module not found.

- [ ] **Step 3: Implement**

```ts
// src/game/cashRate.ts
export class CashRateTracker {
  private _rate: number;
  constructor(private tauMs = 60_000, initial = 0) {
    this._rate = initial;
  }
  observe(cashEarned: number, deltaMs: number): void {
    if (deltaMs <= 0) return;
    const instantaneous = (cashEarned / deltaMs) * 1000;
    const alpha = deltaMs / (this.tauMs + deltaMs);
    this._rate = this._rate + alpha * (instantaneous - this._rate);
  }
  rate(): number {
    return this._rate;
  }
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- cashRate`
Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/game/cashRate.ts src/game/cashRate.test.ts
git commit -m "save: cash-rate EMA tracker (60s tau)"
```

---

### Task 3: Offline award calculator

**Files:**
- Create: `src/game/offlineProgress.ts`
- Create: `src/game/offlineProgress.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/game/offlineProgress.test.ts
import { describe, it, expect } from 'vitest';
import { computeOfflineAward } from './offlineProgress';

describe('computeOfflineAward', () => {
  const capMs = 8 * 60 * 60 * 1000;

  it('returns 0 for zero rate', () => {
    expect(computeOfflineAward({ rate: 0, elapsedMs: 3600_000, capMs })).toBe(0);
  });

  it('returns rate * elapsed within cap', () => {
    expect(computeOfflineAward({ rate: 2, elapsedMs: 10_000, capMs })).toBe(20);
  });

  it('clamps elapsed at cap', () => {
    expect(computeOfflineAward({ rate: 1, elapsedMs: capMs * 10, capMs })).toBe(capMs / 1000);
  });

  it('returns 0 for negative/NaN inputs', () => {
    expect(computeOfflineAward({ rate: -1, elapsedMs: 1000, capMs })).toBe(0);
    expect(computeOfflineAward({ rate: NaN, elapsedMs: 1000, capMs })).toBe(0);
    expect(computeOfflineAward({ rate: 1, elapsedMs: -1, capMs })).toBe(0);
  });

  it('floors to integer cash', () => {
    expect(computeOfflineAward({ rate: 1.7, elapsedMs: 3_500, capMs })).toBe(5);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `npm test -- offlineProgress`
Expected: module not found.

- [ ] **Step 3: Implement**

```ts
// src/game/offlineProgress.ts
export interface OfflineAwardInput {
  rate: number;       // cash/sec
  elapsedMs: number;
  capMs: number;
}
export function computeOfflineAward({ rate, elapsedMs, capMs }: OfflineAwardInput): number {
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  const clamped = Math.min(elapsedMs, capMs);
  return Math.floor(rate * (clamped / 1000));
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- offlineProgress`
Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/game/offlineProgress.ts src/game/offlineProgress.test.ts
git commit -m "save: offline-award calculator with 8h cap"
```

---

### Task 4: `gameplayState.loadSnapshot` + `cashEarned` event

**Files:**
- Modify: `src/game/gameplayState.ts`
- Create/Modify: `src/game/gameplayState.test.ts` (add case)

- [ ] **Step 1: Failing test**

Add to existing or new test file:

```ts
// src/game/gameplayState.test.ts (extend)
import { describe, it, expect, beforeEach } from 'vitest';
import { gameplayState } from './gameplayState';

describe('loadSnapshot', () => {
  beforeEach(() => gameplayState.reset());

  it('restores cash, levels, weapon counts, saw dir and emits events', () => {
    const cashSpy = vi.fn();
    const lvlSpy = vi.fn();
    const cntSpy = vi.fn();
    gameplayState.on('cashChanged', cashSpy);
    gameplayState.on('upgradeLevelChanged', lvlSpy);
    gameplayState.on('weaponCountChanged', cntSpy);

    gameplayState.loadSnapshot({
      cash: 500,
      levels: { sawDamage: 3 },
      weaponCounts: { saw: 2 },
      sawClockwise: false,
    });

    expect(gameplayState.cash).toBe(500);
    expect(gameplayState.levelOf('sawDamage')).toBe(3);
    expect(gameplayState.weaponCount('saw')).toBe(2);
    expect(gameplayState.sawClockwise).toBe(false);
    expect(cashSpy).toHaveBeenCalled();
    expect(lvlSpy).toHaveBeenCalledWith('sawDamage', 3);
    expect(cntSpy).toHaveBeenCalledWith('saw', 2);
  });

  it('emits cashEarned only on positive deltas', () => {
    const earned = vi.fn();
    gameplayState.on('cashEarned', earned);
    gameplayState.addCash(10);
    gameplayState.addCash(-5);
    gameplayState.trySpend(3);
    expect(earned).toHaveBeenCalledTimes(1);
    expect(earned).toHaveBeenCalledWith(10);
  });
});
```

(`vi` import: `import { describe, it, expect, beforeEach, vi } from 'vitest';`)

- [ ] **Step 2: Run — expect failure**

Run: `npm test -- gameplayState`
Expected: missing method / event.

- [ ] **Step 3: Implement**

In `gameplayState.ts`:
- Add `cashEarned: [amount: number]` to `Events`.
- Initialize `cashEarned: new Set()` in `listeners`.
- In `addCash`, after emitting `cashChanged`, if `amount > 0` emit `cashEarned(amount)`.
- Add `loadSnapshot` method:

```ts
loadSnapshot(s: {
  cash: number;
  levels: Record<string, number>;
  weaponCounts: Record<string, number>;
  sawClockwise: boolean;
}): void {
  this._cash = s.cash;
  this.emit('cashChanged', this._cash, s.cash);
  this._levels.clear();
  for (const [k, v] of Object.entries(s.levels)) {
    this._levels.set(k, v);
    this.emit('upgradeLevelChanged', k, v);
  }
  this._weaponCounts.clear();
  for (const [k, v] of Object.entries(s.weaponCounts)) {
    this._weaponCounts.set(k, v);
    this.emit('weaponCountChanged', k, v);
  }
  this._sawClockwise = s.sawClockwise;
  this.emit('sawDirectionChanged', s.sawClockwise);
}
```

- Clear the new listener set in `reset()`.

- [ ] **Step 4: Run — expect pass**

Run: `npm test`
Expected: all previous + new tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/gameplayState.ts src/game/gameplayState.test.ts
git commit -m "save: gameplayState.loadSnapshot + cashEarned event"
```

---

### Task 5: Wire autosave + rate tracker into GameScene

**Files:**
- Modify: `src/scenes/GameScene.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: In `main.ts`, read save on boot and stash in registry**

```ts
// src/main.ts — additions (keep existing code)
import { loadFromLocalStorage, OFFLINE_CAP_MS, MIN_OFFLINE_MS } from './game/saveState';
import { computeOfflineAward } from './game/offlineProgress';

const snapshot = loadFromLocalStorage();
let offlineAward = 0;
let elapsedMs = 0;
if (snapshot) {
  elapsedMs = Date.now() - snapshot.savedAt;
  if (elapsedMs >= MIN_OFFLINE_MS) {
    offlineAward = computeOfflineAward({
      rate: snapshot.emaCashPerSec,
      elapsedMs,
      capMs: OFFLINE_CAP_MS,
    });
  }
}
// after `const game = new Phaser.Game({...})`:
game.registry.set('pendingSnapshot', snapshot);
game.registry.set('offlineAward', offlineAward);
game.registry.set('offlineElapsedMs', Math.min(elapsedMs, OFFLINE_CAP_MS));
```

- [ ] **Step 2: In `GameScene.create`, consume snapshot and start autosave**

Before `this.effectiveParams = applyUpgrades(...)`, replace `gameplayState.resetData()` with:

```ts
const snap = this.game.registry.get('pendingSnapshot') as import('../game/saveState').SaveStateV1 | null;
if (snap) {
  gameplayState.resetData();
  gameplayState.loadSnapshot({
    cash: snap.cash,
    levels: snap.levels,
    weaponCounts: snap.weaponCounts,
    sawClockwise: snap.sawClockwise,
  });
  this.rateTracker = new CashRateTracker(60_000, snap.emaCashPerSec);
  this.game.registry.set('pendingSnapshot', null); // consume once
} else {
  gameplayState.resetData();
  this.rateTracker = new CashRateTracker(60_000, 0);
}
```

Add class field `private rateTracker!: CashRateTracker;` and import.

Subscribe to `cashEarned`:

```ts
this.unsubs.push(
  gameplayState.on('cashEarned', (amount) => {
    const now = this.time.now;
    const dt = now - this.lastEarnedAt;
    this.lastEarnedAt = now;
    this.rateTracker.observe(amount, dt);
  }),
);
```

Add `private lastEarnedAt = 0;` and set `this.lastEarnedAt = this.time.now;` right after tracker init.

- [ ] **Step 3: Autosave timer + beforeunload**

```ts
// helper on GameScene:
private snapshotNow(): void {
  const snap: import('../game/saveState').SaveStateV1 = {
    v: 1,
    cash: gameplayState.cash,
    levels: gameplayState.levels(),
    weaponCounts: Object.fromEntries(
      WEAPON_TYPES.filter((w) => !w.locked).map((w) => [w.id, gameplayState.weaponCount(w.id)]),
    ),
    sawClockwise: gameplayState.sawClockwise,
    emaCashPerSec: this.rateTracker.rate(),
    savedAt: Date.now(),
  };
  saveToLocalStorage(snap);
}
```

In `create()`, start timer + unload hook:

```ts
const autosave = this.time.addEvent({
  delay: 5000,
  loop: true,
  callback: () => this.snapshotNow(),
});
const beforeUnload = () => this.snapshotNow();
window.addEventListener('beforeunload', beforeUnload);
this.events.once('shutdown', () => {
  autosave.remove(false);
  window.removeEventListener('beforeunload', beforeUnload);
});
```

Imports needed at top of file: `import { saveToLocalStorage } from '../game/saveState';` and `import { CashRateTracker } from '../game/cashRate';`.

- [ ] **Step 4: Run full test suite + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all 90+ tests pass, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/scenes/GameScene.ts
git commit -m "save: autosave every 5s + restore snapshot on boot"
```

---

### Task 6: Welcome-back popup in UIScene

**Files:**
- Modify: `src/scenes/UIScene.ts`

- [ ] **Step 1: On UIScene create, check registry and render if award > 0**

```ts
// in UIScene.create(), at end:
const award = this.game.registry.get('offlineAward') as number | undefined;
const elapsed = this.game.registry.get('offlineElapsedMs') as number | undefined;
if (award && award > 0 && elapsed) {
  this.showWelcomeBack(award, elapsed);
  this.game.registry.set('offlineAward', 0);
}
```

- [ ] **Step 2: Implement showWelcomeBack**

```ts
private showWelcomeBack(award: number, elapsedMs: number): void {
  const { width, height } = this.scale;
  const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.6).setOrigin(0, 0).setInteractive();
  const panelW = 420, panelH = 220;
  const panel = this.add.rectangle(width / 2, height / 2, panelW, panelH, 0x1f1f30)
    .setStrokeStyle(2, 0xffffff, 0.3);

  const hours = Math.floor(elapsedMs / 3_600_000);
  const minutes = Math.floor((elapsedMs % 3_600_000) / 60_000);
  const away = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  const title = this.add.text(width / 2, height / 2 - 70, 'Welcome back!', {
    fontFamily: 'sans-serif', fontSize: '28px', color: '#ffffff',
  }).setOrigin(0.5);
  const body = this.add.text(width / 2, height / 2 - 20,
    `You were away for ${away}.\nYour saws earned $${award.toLocaleString()}.`, {
    fontFamily: 'sans-serif', fontSize: '18px', color: '#cccccc', align: 'center',
  }).setOrigin(0.5);
  const btn = this.add.rectangle(width / 2, height / 2 + 60, 160, 44, 0x2d7a3d)
    .setStrokeStyle(2, 0xffffff, 0.5).setInteractive({ useHandCursor: true });
  const btnText = this.add.text(width / 2, height / 2 + 60, 'Collect', {
    fontFamily: 'sans-serif', fontSize: '18px', color: '#ffffff',
  }).setOrigin(0.5);

  const dismiss = () => {
    gameplayState.addCash(award);
    overlay.destroy(); panel.destroy(); title.destroy(); body.destroy();
    btn.destroy(); btnText.destroy();
  };
  btn.on('pointerdown', dismiss);
}
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification in Chrome**

- Run `npm run dev`.
- Play for ~2 minutes, earn some cash.
- Reload — the cash + levels should persist (no welcome-back because reload is fast).
- Open devtools, run `(window as any).__STATE__` (if `?debug=1`) or inspect localStorage — key `asteroid-grinder:save:v1` should exist.
- Close tab, wait 90s, reopen → popup should appear with non-zero award.
- Click Collect — cash increases.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/UIScene.ts
git commit -m "save: welcome-back popup with collect button"
```

---

### Task 7: Code review pass

- [ ] **Step 1: Dispatch fresh reviewer** on the Phase 7 diff covering `saveState.ts`, `cashRate.ts`, `offlineProgress.ts`, `gameplayState.ts`, `GameScene.ts`, `UIScene.ts`, `main.ts`. Review focus: storage-quota safety, version migration safety, shutdown leaks (timer + event listener), registry staleness on scene restart.

- [ ] **Step 2: Address blocking findings** (ignore nitpicks unless quick).

- [ ] **Step 3: Commit any fixes.**

---

### Task 8: Docs + final verification

- [ ] **Step 1: Update ROADMAP.md** — mark Phase 7 done (2026-04-16) with one-line summary.
- [ ] **Step 2: Update CLAUDE.md** — add bullet under "Phaser + Matter gotchas" for `beforeunload` + registry handshake if anything subtle.
- [ ] **Step 3: Update README.md** if feature list is user-facing.
- [ ] **Step 4: Run** `npm test && npx tsc --noEmit && npm run build`. Expected: green.
- [ ] **Step 5: Verify in Chrome via MCP:**
  - Load page, play 60s, earn cash.
  - Force-close via window.close simulation OR reload after ≥ 60s wait.
  - Confirm popup appears with correct award.
  - Click Collect → cash added → popup dismissed.
  - No console errors.
- [ ] **Step 6: Commit docs** and FF-merge feature branch to main after user approval.

---

## Self-review

- **Coverage:** autosave ✔ (Task 5), load ✔ (Task 5), offline popup ✔ (Task 6), EMA rate ✔ (Task 2), offline-award math ✔ (Task 3), schema versioning ✔ (Task 1), code review ✔ (Task 7), docs/verify ✔ (Task 8).
- **Placeholders:** none — each task has code + commands.
- **Type consistency:** `SaveStateV1` shape is identical across `saveState.ts`, `main.ts`, `GameScene.ts`. `loadSnapshot` argument type matches. `CashRateTracker` constructor signature consistent.
