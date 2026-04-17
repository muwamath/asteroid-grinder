// All arena tuning lives here. Referenced from generator, slot state,
// and scene wiring. Placeholder cost values are re-tuned in the §4 economy pass.

export const MIN_SLOTS = 4;
export const MAX_SLOTS = 10;
export const BASE_STARTING_SLOTS = 2;

export const UNLOCK_BASE = 50;
export const UNLOCK_GROWTH = 2.5;

export const MAX_DEPTH = 4;
export const SPLIT_P_DECAY = 0.6;
export const VERTICAL_AXIS_WEIGHT = 2;
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
