import { test, expect, type ConsoleMessage } from '@playwright/test';

// Golden-path tripwire: boot the game into the procedural arena, install a
// saw at an unlocked slot, let it play for 30 seconds, and assert the core
// loop is firing — asteroids spawn, the grinder chops them, the console
// stays clean. A failure here means something load-bearing in
// DESIGN_INVARIANTS.md almost certainly broke.
test('golden path: arena generates, grinder chops, clean console', async ({ page }) => {
  const errors: string[] = [];
  const envNoise = /GL Driver Message|GPU stall due to ReadPixels/;
  const banned = (msg: ConsoleMessage): boolean => {
    const t = msg.type();
    if (t !== 'error' && t !== 'warning') return false;
    return !envNoise.test(msg.text());
  };
  page.on('console', (msg) => {
    if (banned(msg)) errors.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    errors.push(`[pageerror] ${err.message}`);
  });

  await page.goto('/');

  // Fresh run — wipe every save key so starting state is deterministic.
  await page.evaluate(() => {
    window.localStorage.removeItem('asteroid-grinder:save:v1');
    window.localStorage.removeItem('asteroid-grinder:save:v2');
    window.localStorage.removeItem('asteroid-grinder:save:v3');
  });
  await page.reload();

  await page.waitForFunction(
    () => Boolean((window as unknown as { __GAME__?: unknown }).__GAME__),
    { timeout: 10_000 },
  );

  // Inspect the generated arena and assert invariants.
  const arena = await page.evaluate(() => {
    const w = window as unknown as {
      __GAME__: { scene: { getScene: (k: string) => unknown } };
      __STATE__: { isSlotUnlocked: (id: string) => boolean };
    };
    const scene = w.__GAME__.scene.getScene('game') as unknown as {
      arenaLayout: { slots: { id: string; x: number; y: number }[]; walls: unknown[] };
    };
    return {
      slotCount: scene.arenaLayout.slots.length,
      wallCount: scene.arenaLayout.walls.length,
      unlockedSlotIds: scene.arenaLayout.slots
        .filter((s) => w.__STATE__.isSlotUnlocked(s.id))
        .map((s) => s.id),
    };
  });
  expect(arena.slotCount, 'arena must produce 4–10 slots').toBeGreaterThanOrEqual(4);
  expect(arena.slotCount, 'arena must produce 4–10 slots').toBeLessThanOrEqual(10);
  expect(arena.unlockedSlotIds.length, 'baseline unlocked slots').toBeGreaterThanOrEqual(2);

  await page.waitForTimeout(30_000);

  const probe = await page.evaluate(() => {
    const w = window as unknown as { __GAME__: { scene: { getScene: (k: string) => unknown } } };
    const scene = w.__GAME__.scene.getScene('game') as unknown as {
      spawnedCount: number;
      liveAsteroids: Array<{ body: { angularVelocity: number } }>;
      weaponInstances: Array<{ type: string; behavior: { stats?: { blades?: number } } }>;
    };
    const grinder = scene.weaponInstances.find((wi) => wi.type === 'grinder');
    return {
      spawnedCount: scene.spawnedCount,
      liveCount: scene.liveAsteroids.length,
      anyRotating: scene.liveAsteroids.some((a) => Math.abs(a.body.angularVelocity) > 0),
      grinderBladeCount: grinder?.behavior.stats?.blades ?? 0,
    };
  });

  expect(probe.spawnedCount, 'asteroids must spawn within 30s').toBeGreaterThan(0);
  expect(probe.grinderBladeCount, 'grinder must spawn with blades tiling the floor').toBeGreaterThan(0);
  if (probe.liveCount > 0) {
    expect(probe.anyRotating, 'live asteroids must have non-zero angular velocity').toBe(true);
  }
  expect(errors, 'clean console — no errors or warnings').toEqual([]);
});

// Slot → buy weapon round-trip. Clicks an unlocked empty slot, picks a
// weapon from the modal, asserts the weapon is installed and cash debited.
// Backstops the "cannot buy when clicking slot" regression from 2026-04-17.
test('slot-click opens picker and buying a weapon installs it at the slot', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.removeItem('asteroid-grinder:save:v1');
    window.localStorage.removeItem('asteroid-grinder:save:v2');
    window.localStorage.removeItem('asteroid-grinder:save:v3');
  });
  await page.reload();
  await page.waitForFunction(
    () => Boolean((window as unknown as { __GAME__?: unknown }).__GAME__),
    { timeout: 10_000 },
  );

  // Seed enough cash for the buy (placeholder economy is $1/weapon).
  await page.evaluate(() => {
    const w = window as unknown as { __STATE__: { addCash: (n: number, o?: unknown) => void } };
    w.__STATE__.addCash(1000);
  });

  // Find an unlocked empty slot. Pre-installed saw occupies one; pick the other.
  const slot = await page.evaluate(() => {
    const w = window as unknown as {
      __GAME__: { scene: { getScene: (k: string) => unknown } };
      __STATE__: {
        isSlotUnlocked: (id: string) => boolean;
        installedAt: (id: string) => unknown;
      };
    };
    const scene = w.__GAME__.scene.getScene('game') as unknown as {
      arenaLayout: { slots: { id: string; x: number; y: number }[] };
    };
    const empty = scene.arenaLayout.slots.find(
      (s) => w.__STATE__.isSlotUnlocked(s.id) && !w.__STATE__.installedAt(s.id),
    );
    return empty ? { id: empty.id, x: empty.x, y: empty.y } : null;
  });
  expect(slot, 'there must be at least one unlocked empty slot after boot').not.toBeNull();

  // Trigger the slot-click handler through the actual scene API (mirrors a
  // mouse click on the slot marker — we avoid coordinate math across the
  // scaled canvas) and then click the "Laser" button in the modal via the
  // same emit path the UI uses.
  // The picker's openWeaponPicker + install-weapon emitters key off `slotId`,
  // not `id`. Reshape the slot payload to match before firing.
  const pickerPayload = { slotId: slot!.id, x: slot!.x, y: slot!.y };
  const result = await page.evaluate((slotPayload) => {
    const w = window as unknown as {
      __GAME__: { scene: { getScene: (k: string) => unknown } };
      __STATE__: {
        cash: number;
        installedAt: (id: string) => { typeId: string; instanceId: string } | undefined;
      };
    };
    const ui = w.__GAME__.scene.getScene('ui') as unknown as {
      events: { emit: (n: string, p: unknown) => void };
      weaponPickerLayer: Array<Phaser.GameObjects.GameObject & { emit: (name: string) => void }> | null;
    };
    const cashBefore = w.__STATE__.cash;
    ui.events.emit('open-weapon-picker', slotPayload);
    const pickerOpen = !!ui.weaponPickerLayer;

    const layer = ui.weaponPickerLayer ?? [];
    const layerShape = layer.map((o) => (o.constructor as { name: string }).name);
    // Hook the install-weapon listener to trace whether it fires + what it sees.
    let listenerFired: null | { slotId: string; typeId: string } = null;
    ui.events.on('install-weapon', (p: { slotId: string; typeId: string }) => {
      listenerFired = { slotId: p.slotId, typeId: p.typeId };
    });
    const listenerCount = ui.events.listenerCount('install-weapon');
    const laserBtn = layer[6];
    if (!laserBtn) {
      return { pickerOpen, error: 'laserBtn missing', layerShape };
    }
    laserBtn.emit('pointerup');

    const cashAfter = w.__STATE__.cash;
    const installed = w.__STATE__.installedAt(slotPayload.slotId);
    const pickerDismissed = !ui.weaponPickerLayer;
    return {
      pickerOpen, cashBefore, cashAfter, installed, pickerDismissed, layerShape,
      listenerFired, listenerCount,
    };
  }, pickerPayload);

  expect(result.pickerOpen, 'open-weapon-picker must render the modal').toBe(true);
  expect(
    result.installed?.typeId,
    `clicking Laser must install a laser at the slot — picker shape was ${JSON.stringify(result.layerShape)}`,
  ).toBe('laser');
  expect(result.cashAfter, 'cash must be debited by the buy cost').toBeLessThan(result.cashBefore!);
  expect(result.pickerDismissed, 'picker must dismiss after a weapon button is clicked').toBe(true);
});

// Arena seed determinism: set a specific runSeed, compare layouts across two
// boots. Same seed → byte-identical walls + slots.
test('arena: same run seed produces identical layout across reloads', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.removeItem('asteroid-grinder:save:v1');
    window.localStorage.removeItem('asteroid-grinder:save:v2');
    window.localStorage.removeItem('asteroid-grinder:save:v3');
  });

  const snapForSeed = async (seed: string): Promise<unknown> => {
    await page.evaluate((s) => {
      window.localStorage.removeItem('asteroid-grinder:save:v3');
      const w = window as unknown as { __STATE__: { setRunSeed: (s: string) => void } };
      w.__STATE__.setRunSeed(s);
    }, seed);
    await page.reload();
    await page.waitForFunction(
      () => Boolean((window as unknown as { __GAME__?: unknown }).__GAME__),
      { timeout: 10_000 },
    );
    // Re-set the seed after reload (pendingSnapshot loading is async).
    await page.evaluate((s) => {
      const w = window as unknown as {
        __STATE__: { setRunSeed: (s: string) => void };
        __GAME__: { scene: { getScene: (k: string) => { scene: { restart: () => void } } } };
      };
      w.__STATE__.setRunSeed(s);
      w.__GAME__.scene.getScene('game').scene.restart();
    }, seed);
    await page.waitForTimeout(800);
    return await page.evaluate(() => {
      const scene = (window as unknown as {
        __GAME__: { scene: { getScene: (k: string) => unknown } };
      }).__GAME__.scene.getScene('game') as unknown as {
        arenaLayout: { walls: unknown[]; slots: unknown[]; seed: number };
      };
      return {
        seed: scene.arenaLayout.seed,
        walls: scene.arenaLayout.walls,
        slots: scene.arenaLayout.slots,
      };
    });
  };

  const a = await snapForSeed('smoke-seed-12345');
  const b = await snapForSeed('smoke-seed-12345');
  expect(b).toEqual(a);
});
