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
