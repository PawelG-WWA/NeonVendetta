import { Components } from './components.js';

export const TINT_HIT_FLASH = 0xff4444;
export const TINT_COOLDOWN = 0x8a8a8a;
export const TINT_DEFAULT = 0xffffff;

// Tint derivation — single source for sprite tinting, applied by renderSystem
// every frame from component state (no system writes material color directly).
// Priority is deterministic: HitFlash (damage feedback red) wins over Cooldown
// (overheat gray) when both are present; neither means white.
export function deriveTint(world, entityId) {
  if (world.hasComponent(entityId, Components.HitFlash)) {
    return TINT_HIT_FLASH;
  }
  if (world.hasComponent(entityId, Components.Cooldown)) {
    return TINT_COOLDOWN;
  }
  return TINT_DEFAULT;
}
