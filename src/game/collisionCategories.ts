// Matter collision categories. Default category is 0x0001.
// Live chunks, arena walls, saw blades, and weapon sprites use default;
// categories added here opt specific bodies into selective collision.

export const CAT_DEFAULT = 0x0001;
export const CAT_GRINDER_BLADE = 0x0008;
export const CAT_DEAD_CHUNK = 0x0010;

// Default mask: collide with everything (0xFFFFFFFF).
// Grinder blades collide with everything EXCEPT dead chunks (so corpses fall through).
export const MASK_GRINDER_BLADE = 0xFFFFFFFF & ~CAT_DEAD_CHUNK;
// Dead chunks collide with everything EXCEPT grinder blades.
export const MASK_DEAD_CHUNK = 0xFFFFFFFF & ~CAT_GRINDER_BLADE;
