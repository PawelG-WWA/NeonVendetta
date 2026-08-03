import { Components } from '../components.js';

const TIME_EPSILON = 1e-9;

const QUERY = Object.freeze([Components.Lifetime]);

// LifetimeSystem — generic ephemeral entity lifecycle (muzzle flashes at the
// gun, hit sparks at bullet impacts). Counts Lifetime.timer down and destroys
// the entity at zero.
// When the entity also carries AnimState + Sprite, the frame cursor tracks the
// elapsed fraction of the lifetime, playing the sheet exactly once.
export function createLifetimeSystem(world) {
  const matches = [];

  return {
    update(dt) {
      world.queryInto(QUERY, matches);
      for (let i = 0; i < matches.length; i++) {
        const id = matches[i];
        const lifetime = world.getComponent(id, Components.Lifetime);
        lifetime.timer -= dt;

        const anim = world.getComponent(id, Components.AnimState);
        const sprite = world.getComponent(id, Components.Sprite);
        if (anim !== undefined && sprite !== undefined) {
          const totalFrames = sprite.cols * sprite.rows;
          const progress = 1 - Math.max(lifetime.timer, 0) / lifetime.duration;
          anim.frame = Math.min(totalFrames - 1, Math.floor(progress * totalFrames));
        }

        if (lifetime.timer <= TIME_EPSILON) {
          world.destroyEntity(id);
        }
      }
    },
  };
}
