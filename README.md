# Asteroid Grinder

An idle physics sandbox. Pinata blocks fall from above. Draggable stoppers with mountable weapons chop them up. Upgrade everything. Watch the physics. Relax.

Phaser 3 + Matter.js + TypeScript + Vite. Port of an earlier Unity prototype ([`/Users/matt/dev/Unity/Pinata Grinder`](../../Unity/Pinata%20Grinder)) to a web-native stack.

## Status

Phase 0 — **spike**. Minimal playable loop: draggable stopper, orbiting saw blade, falling 3×3 pinata blocks, death line, cash HUD. No upgrades, no save, no weapons beyond the saw. Exists to validate the engine choice before porting the full feature set.

## Run locally

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173.

## Scripts

| command | what it does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check then produce `dist/` |
| `npm run preview` | Serve the built `dist/` for smoke testing |
| `npm run typecheck` | `tsc --noEmit` (no bundling) |

## Docs

- [ROADMAP.md](ROADMAP.md) — phases and current todos
- [CLAUDE.md](CLAUDE.md) — project conventions for Claude Code
