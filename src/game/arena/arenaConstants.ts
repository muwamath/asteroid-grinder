// All arena tuning lives here. Referenced from generator, slot state,
// and scene wiring. Placeholder cost values are re-tuned in the §4 economy pass.

export const MIN_SLOTS = 4;
export const MAX_SLOTS = 10;
// Every slot starts unlocked — locking was deprecated 2026-04-17 after the
// UI felt confusing with grey padlock markers. Prestige `preUnlockedSlots`
// is now vestigial (always ≥ MAX_SLOTS after this).
export const BASE_STARTING_SLOTS = MAX_SLOTS;

export const UNLOCK_BASE = 50;
export const UNLOCK_GROWTH = 2.5;

export const MAX_DEPTH = 4;
// Higher = deeper tree → more walls per map. 0.8 keeps depth-3 splits at
// ~51% likely (vs 22% at 0.6), lifting avg wall count ~3→~5 and avg slants
// ~1.9→~3 when paired with the horizontal-axis bias below.
export const SPLIT_P_DECAY = 0.8;
// Horizontal-axis bias: P(vertical) = WEIGHT / (WEIGHT + 1). At 0.5 → 33%
// vertical, 67% horizontal. With ~4.5 total splits per map that yields ~3
// slanted walls on average — busier, more "cascading ledges" feel than
// the original vertical-dominant layouts.
export const VERTICAL_AXIS_WEIGHT = 0.5;
export const MIN_WALL_SLANT_DEG = 8;
export const MIN_LEAF_DIM = 220;
export const SLOT_SPACING = 180;
export const MAX_RETRIES = 8;

export const WALL_COLLIDER_THICKNESS = 40;
export const FLOOR_BAND_HEIGHT = 60;

export const PHASE_STEP_RAD = 0.37;
export const SPAWN_MARGIN = 32;

// Slot placement must clear the grinder row at the floor by this much so
// clicks on slots don't get intercepted by grinder blade hit boxes.
export const MIN_SLOT_FLOOR_CLEARANCE = 160;

// Minimum distance from any wall-segment center-line to a slot position.
// Wall collider half-thickness is 20, weapon sprite radius is ~40, so 80
// is the minimum "no-overlap" clearance. A bit more for breathing room.
export const MIN_SLOT_WALL_CLEARANCE = 100;
