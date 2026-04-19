---
name: ff-merge-checklist
description: Run the pre-merge gate for a feature branch — typecheck, unit tests, Playwright smoke, docs-in-sync check, invariant check, and surface what needs a manual User eyeball. Use this before fast-forward-merging any feature branch to main.
---

# Pre-merge gate for Asteroid Grinder

The User's workflow requires a hard gate before any FF-merge to `main`. This skill walks through every check, reports pass/fail with evidence, then pauses for manual verification.

## Checklist (run in order, report each)

### 1. Clean working tree
```bash
git status --porcelain
```
Must be empty. If not — stop; uncommitted work is a blocker.

### 2. On a feature branch (not main)
```bash
git rev-parse --abbrev-ref HEAD
```
Must start with `feature/`. If on `main`, there's nothing to merge.

### 3. Typecheck
```bash
npm run typecheck
```
Must exit 0.

### 4. Unit tests
```bash
npm test
```
Must exit 0. Capture the test count — CLAUDE.md claims "178 tests across 18 files"; if the actual count differs, CLAUDE.md is out of sync (see step 7).

### 5. Vite build
```bash
npm run build
```
Must exit 0. "It typechecks" ≠ "it builds."

### 6. Playwright smoke
```bash
npm run test:e2e
```
Must exit 0. The smoke test asserts non-zero saw hits, rotating asteroids, no console errors.

### 7. Docs in sync
Check that these three reflect the branch's work:
- `README.md` — feature list current
- `CLAUDE.md` — test count, architecture patterns, gotchas
- `ROADMAP.md` — phase marked done with date, completed todos pruned

Run `git diff main...HEAD -- README.md CLAUDE.md ROADMAP.md` and verify each is updated. If a doc is untouched but the work clearly affects it, flag it.

### 8. Invariant check
Dispatch the `invariant-checker` subagent with the branch diff.

### 9. Balance check
Dispatch the `gameplay-balance-guard` subagent with the branch diff.

### 10. Live deploy validation plan
The User must still manually eyeball the build. After FF-merge + GitHub Pages deploy, confirm:
- Live URL loads without console errors
- Feature visible / working on the live build
- `?restart=1` wipes localStorage + seeds $10k for playtesting

## Final report

Produce a table:

| Check | Status | Evidence |
|-------|--------|----------|
| Clean tree | ✅/🔴 | ... |
| Typecheck  | ✅/🔴 | ... |
| Unit tests | ✅/🔴 | N tests passed |
| Build      | ✅/🔴 | ... |
| Playwright | ✅/🔴 | ... |
| Docs sync  | ✅/⚠️/🔴 | ... |
| Invariants | ✅/🔴 | ... |
| Balance    | ✅/⚠️/🔴 | ... |

If any row is 🔴 — hard block, do not propose merge.
If any row is ⚠️ — surface to User, get explicit approval.
If all ✅ — tell the User the branch is ready for manual eyeball and await explicit approval before FF-merging. Do NOT merge autonomously. Per CLAUDE.md: "Automated verification is necessary but not sufficient."

## Non-goals

- Do NOT run `git merge` or `git push` — the User does that after eyeballing.
- Do NOT edit code to fix failing checks — report the failure and stop.
