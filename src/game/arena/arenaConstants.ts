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

// Bumped 4 → 5 (2026-04-19) so BSP produces roughly 2× more leaves
// (and therefore roughly 2× more walls) per map. Pairs with tighter wall
// spans to give "lots more, smaller walls" feel.
export const MAX_DEPTH = 5;
// Higher = deeper tree → more walls per map. 0.8 keeps depth-3 splits at
// ~51% likely (vs 22% at 0.6).
export const SPLIT_P_DECAY = 0.8;
// Every wall's rotation is uniform in [-MAX_WALL_SLANT_DEG, +MAX_WALL_SLANT_DEG]
// applied to its BSP-horizontal base. ±45° gives the full `/` to `\` range.
export const MAX_WALL_SLANT_DEG = 45;
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

// Obstacle / peg ranges, sampled per map (arena variety pass 2026-04-19).
// Obstacles = medium blockers (circles + diamonds) that catch chunks.
// Pegs = small pachinko deflectors, mostly flavour.
export const OBSTACLE_COUNT_MIN = 2;
export const OBSTACLE_COUNT_MAX = 4;
export const OBSTACLE_CIRCLE_R_MIN = 30;
export const OBSTACLE_CIRCLE_R_MAX = 60;
export const OBSTACLE_DIAMOND_HALF_MIN = 30;
export const OBSTACLE_DIAMOND_HALF_MAX = 55;
export const PEG_COUNT_MIN = 4;
export const PEG_COUNT_MAX = 12;
export const PEG_R_MIN = 8;
export const PEG_R_MAX = 15;
