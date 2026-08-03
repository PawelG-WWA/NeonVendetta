import { Components } from '../components.js';

const QUERY = Object.freeze([
  Components.Dead,
  Components.AnimState,
  Components.Sprite,
]);

// DeathAnimSystem — advances the death sheet exactly once across the
// Dead.timer lifetime. The frame count is PER ENTITY from its Sprite grid
// (cols * rows — set by damageSystem from the type's ENEMY_DEFS entry):
// player 8x1 = 8, simple/tough 4x2 = 8, medium 5x2 = 10. Runs before
// damageSystem's countdown so the final frame shows for the last tick.
export function createDeathAnimSystem(world) {
  const matches = [];

  return {
    update(dt) {
      world.queryInto(QUERY, matches);
      for (let i = 0; i < matches.length; i++) {
        const id = matches[i];
        const dead = world.getComponent(id, Components.Dead);
        const anim = world.getComponent(id, Components.AnimState);
        const sprite = world.getComponent(id, Components.Sprite);
        const frameCount = sprite.cols * sprite.rows;
        if (dead.duration <= 0) {
          anim.frame = frameCount - 1;
          continue;
        }
        anim.timer += dt;
        const frameDuration = dead.duration / frameCount;
        while (anim.timer >= frameDuration && anim.frame < frameCount - 1) {
          anim.timer -= frameDuration;
          anim.frame += 1;
        }
      }
    },
  };
}
