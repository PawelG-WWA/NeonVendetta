import { Components } from '../components.js';

const QUERY = Object.freeze([Components.HitFlash]);

// HitFlashSystem — damage feedback: counts down HitFlash.timer (set by
// damageSystem) and removes the component when it expires. The red tint
// itself is derived by renderSystem from the component's presence (see
// ecs/tint.js) — this system no longer touches material color.
export function createHitFlashSystem(world) {
  const matches = [];

  return {
    update(dt) {
      world.queryInto(QUERY, matches);
      for (let i = 0; i < matches.length; i++) {
        const id = matches[i];
        const flash = world.getComponent(id, Components.HitFlash);
        flash.timer -= dt;
        if (flash.timer <= 0) {
          world.removeComponent(id, Components.HitFlash);
        }
      }
    },
  };
}
