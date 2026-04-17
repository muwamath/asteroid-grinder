import { test, expect, type ConsoleMessage } from '@playwright/test';

// Golden-path tripwire: boot the game, let it play for 30 seconds, assert
// the core loop is firing — asteroids spawn, they rotate, the saw hits
// them, and nothing screams in the console. A failure here means
// something load-bearing in DESIGN_INVARIANTS.md almost certainly broke.
//
// Why 30s and not 10s: asteroids fall from above the channel down to the
// death line at current gravity; the full traverse takes longer than the
// window. We teleport the saw to the top of the channel immediately after
// boot so it intercepts the first wave within the 30s budget regardless
// of where defaults drop it.
test('golden path: game boots, grinding loop runs, clean console', async ({ page }) => {
  const errors: string[] = [];
  // Headless Chromium emits WebGL GPU-driver performance warnings
  // ("GL Driver Message (OpenGL, Performance, ...): GPU stall due to
  // ReadPixels") that are environmental noise, not app code issues.
  // They don't appear in real browsers. Filter them out.
  const envNoise = /GL Driver Message|GPU stall due to ReadPixels/;
  const banned = (msg: ConsoleMessage) => {
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

  // Fresh run — drop the save key from a previous test session so
  // starting cash and weapon counts are deterministic. Targeted
  // `removeItem` so we don't clobber unrelated localhost storage.
  await page.evaluate(() => {
    window.localStorage.removeItem('asteroid-grinder:save:v1');
    window.localStorage.removeItem('asteroid-grinder:save:v2');
  });
  await page.reload();

  await page.waitForFunction(() => Boolean((window as unknown as { __GAME__?: unknown }).__GAME__), {
    timeout: 10_000,
  });

  // Teleport the saw to the top of the chute so the first wave reaches it
  // well within the 30s test budget. Without this, default-positioned saws
  // sit mid-channel and the fall from spawn takes longer than 30s.
  await page.evaluate(() => {
    const w = window as unknown as { __GAME__: { scene: { getScene: (k: string) => unknown } } };
    const scene = w.__GAME__.scene.getScene('game') as unknown as {
      weaponInstances: Array<{ type: string; sprite: { setPosition: (x: number, y: number) => void } }>;
      scale: { width: number };
    };
    const saw = scene.weaponInstances.find((wi) => wi.type === 'saw');
    if (saw) saw.sprite.setPosition(scene.scale.width / 2, 200);
  });

  await page.waitForTimeout(30_000);

  const probe = await page.evaluate(() => {
    const w = window as unknown as { __GAME__: { scene: { getScene: (k: string) => unknown } } };
    const scene = w.__GAME__.scene.getScene('game') as unknown as {
      liveAsteroids: Array<{ body: { angularVelocity: number; angle: number } }>;
      weaponHits: number;
      spawnedCount: number;
      weaponInstances: Array<{
        type: string;
        behavior: { stats?: { blades?: number } };
      }>;
    };
    const angularVelocities = scene.liveAsteroids.map((a) => a.body.angularVelocity);
    const anyRotating = angularVelocities.some((v) => Math.abs(v) > 0);
    const grinder = scene.weaponInstances.find((wi) => wi.type === 'grinder');
    return {
      spawnedCount: scene.spawnedCount,
      liveCount: scene.liveAsteroids.length,
      weaponHits: scene.weaponHits,
      anyRotating,
      grinderBladeCount: grinder?.behavior.stats?.blades ?? 0,
    };
  });

  expect(probe.spawnedCount, 'asteroids must spawn within 30s').toBeGreaterThan(0);
  expect(probe.weaponHits, 'saw must hit at least one chunk within 30s').toBeGreaterThan(0);
  expect(probe.grinderBladeCount, 'grinder must spawn with blades tiling the channel').toBeGreaterThan(0);
  // Rotation invariant holds only if at least one asteroid is currently live.
  // If they've all been ground away in 10s that's also fine — the loop is
  // clearly firing.
  if (probe.liveCount > 0) {
    expect(probe.anyRotating, 'live asteroids must have non-zero angular velocity').toBe(true);
  }
  expect(errors, 'clean console — no errors or warnings').toEqual([]);
});

// Prestige smoke: seed a high-damage save so a vault core dies within 45s,
// then assert pendingShardsThisRun went up. Uses the v2 save schema directly
// so no migration path is exercised here (migration is covered by vitest).
test('prestige: vault core kill accrues pending shards', async ({ page }) => {
  const envNoise = /GL Driver Message|GPU stall due to ReadPixels/;
  const errors: string[] = [];
  page.on('console', (msg) => {
    const t = msg.type();
    if ((t === 'error' || t === 'warning') && !envNoise.test(msg.text())) {
      errors.push(`[${t}] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));

  await page.addInitScript(() => {
    const synthetic = {
      v: 2,
      cash: 9999,
      levels: { 'saw.damage': 50, 'asteroids.quality': 8, 'saw.bladeCount': 4 },
      weaponCounts: { grinder: 1, saw: 1, laser: 0, missile: 0, blackhole: 0 },
      weaponInstances: [{ typeId: 'saw', x: 1280, y: 200, clockwise: true }],
      emaCashPerSec: 0,
      savedAt: Date.now(),
      runSeed: 'smoke-seed',
      pendingShardsThisRun: 0,
      prestigeShards: 0,
      prestigeCount: 0,
      prestigeShopLevels: {},
      instancesBoughtThisRun: {},
    };
    window.localStorage.setItem('asteroid-grinder:save:v2', JSON.stringify(synthetic));
  });

  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __GAME__?: unknown }).__GAME__), {
    timeout: 10_000,
  });

  // Wait up to 45s for at least one vault kill → pendingShardsThisRun > 0.
  await page.waitForFunction(() => {
    const w = window as unknown as { __GAME__?: { scene: { getScene: (k: string) => unknown } } };
    const scene = w.__GAME__?.scene.getScene('game') as unknown as {
      getPendingShardsThisRun?: () => number;
    } | undefined;
    return (scene?.getPendingShardsThisRun?.() ?? 0) > 0;
  }, { timeout: 45_000 });

  expect(errors, 'clean console during prestige smoke').toEqual([]);
});
