# Asteroid Grinder Roadmap

Living document. Phases are strategic milestones; the todo list at the bottom tracks the next concrete actions for the current phase.

## Phases

1. **Engine spike** — **in progress**. Scaffold Vite + TypeScript + Phaser 3 + Matter.js. Minimal playable loop: draggable stopper, orbiting saw blade, falling 3×3 pinata blocks, red death line, cash counter. Goal is to validate the engine choice end-to-end (write code → Vite HMR → Chrome) before committing to the full port.
2. **Core loop parity** — pending. Full Pinata Grinder core loop: real Pinata composite bodies with per-block grid, per-square HP, colored variants, confetti on weapon kill, $1 death-line fallback, Economy singleton equivalent.
3. **Weapons** — pending. Port all four Pinata Grinder weapon types:
   - Saw Blade (physical contact damage)
   - Laser (beam + continuous energy damage)
   - Missile (homing AOE with lead targeting)
   - Black Hole (gravity vortex)
   Each with its own upgrade slots (damage / fire rate / range / blade count etc.).
4. **Stoppers & shop** — pending. Multiple draggable stoppers, per-stopper weapon menu, sell-and-refund, buy-more-stoppers button with escalating cost.
5. **Global upgrades** — pending. Wall size, pinata size, spawner rate, oscillation, pinata HP, death-line damage.
6. **Pinata variants** — pending. Basic / Armored / Shielded / Swift / Heavy with per-variant resistances and reward multipliers.
7. **Save & offline** — pending. `localStorage` autosave every N seconds, welcome-back offline-progression popup.
8. **Menu & HUD polish** — pending. Options menu, manual save, restart, debug overlay, shop styling.
9. **Art & audio pass** — pending. Palette, particle polish, lo-fi loop, chunky SFX.
10. **Code review** — pending. Fresh reviewer agent, findings, fixes. (Required phase per global conventions.)
11. **Final verification & remote deploy** — pending. Full typecheck + build, live validation in Chrome, push to a new GitHub repo, optional GH Pages setup.

## Current todos (Phase 1 — Engine spike)

- [x] Scaffold `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/scenes/GameScene.ts`.
- [x] Write spike scene: draggable stopper, orbiting saw, pinata spawner, death line, cash HUD.
- [x] Procedural textures for block / stopper / saw (no art assets yet).
- [ ] `npm install` and confirm the dev server runs.
- [ ] Open in Chrome via DevTools MCP and verify the gameplay loop is fun to watch.
- [ ] Matt eyeball gate — does Phaser feel right?

## Backlog (future work)

- Additional weapons from `TODO.md` in the Unity project (Tesla Coil, Freeze Ray, Flak Cannon, Gravity Well, Rail Gun, Drone Swarm).
- Prestige / meta loop (no design yet).
- Mobile/portrait mode.
- Achievements, cosmetics.
