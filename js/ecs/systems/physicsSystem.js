import { Components, ClimbingModes } from '../components.js';
import { getFloorY, getFloorId } from '../../world/floors.js';

const GRAVITY_ACCELERATION = 2400;

const QUERY = Object.freeze([
  Components.Position,
  Components.Velocity,
  Components.Gravity,
  Components.Grounded,
  Components.Climbing,
  Components.InsideBuilding,
]);

// Downward velocity is intentionally preserved while grounded (position is
// snapped to the floor but velocity is untouched) so that boundsSystem can
// still read a controller's downward intent (doorway exit) after physics.
// Velocity is only zeroed on an airborne -> grounded landing transition;
// boundsSystem zeroes any grounded downward velocity that no doorway exit
// consumed, so stale intent never lingers on stationary entities.
export function createPhysicsSystem(world) {
  const matches = [];

  return {
    update(dt) {
      world.queryInto(QUERY, matches);
      for (let i = 0; i < matches.length; i++) {
        const id = matches[i];
        const position = world.getComponent(id, Components.Position);
        const velocity = world.getComponent(id, Components.Velocity);
        const gravity = world.getComponent(id, Components.Gravity);
        const grounded = world.getComponent(id, Components.Grounded);
        const climbing = world.getComponent(id, Components.Climbing);
        const inside = world.getComponent(id, Components.InsideBuilding);

        if (climbing.mode !== ClimbingModes.NONE) {
          grounded.value = false;
          grounded.floorId = null;
          position.x += velocity.x * dt;
          position.y += velocity.y * dt;
          continue;
        }

        if (gravity.scale > 0 && !grounded.value) {
          velocity.y -= GRAVITY_ACCELERATION * gravity.scale * dt;
        }

        position.x += velocity.x * dt;
        position.y += velocity.y * dt;

        const floorY = getFloorY(inside);
        if (position.y > floorY) {
          grounded.value = false;
          grounded.floorId = null;
        } else if (velocity.y <= 0) {
          position.y = floorY;
          if (!grounded.value) {
            velocity.y = 0;
            grounded.value = true;
            grounded.floorId = getFloorId(inside);
          }
        } else {
          grounded.value = false;
          grounded.floorId = null;
        }
      }
    },
  };
}
