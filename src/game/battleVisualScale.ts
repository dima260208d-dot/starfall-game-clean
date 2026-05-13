/**
 * Brawler sprites are drawn at `radius * BRAWLER_DRAW_SCALE` in world canvas space.
 * Projectile / battle-VFX art was tuned when draw scale was ~2.8; scale decor so it
 * stays proportional when `BRAWLER_DRAW_SCALE` is changed (gameplay radii unchanged).
 */
export const BRAWLER_DRAW_SCALE = 2.45;
const BRAWLER_DRAW_SCALE_VFX_TUNED_AT = 2.8;

export const WORLD_VFX_CANVAS_SCALE = BRAWLER_DRAW_SCALE / BRAWLER_DRAW_SCALE_VFX_TUNED_AT;
