import { Components, ClimbingModes, BuildingIds } from '../components.js';
import { LAYOUT, GAME_WIDTH } from '../../world/layout.js';
import { getFloorY, getFloorId, OUTDOOR_FLOOR_ID } from '../../world/floors.js';

const QUERY = Object.freeze([
  Components.Position,
  Components.Velocity,
  Components.Body,
  Components.Grounded,
  Components.Climbing,
  Components.InsideBuilding,
  Components.BoundsConstrained,
]);

const DOORWAY_BUILDING_IDS = Object.freeze([BuildingIds.LEFT, BuildingIds.RIGHT]);

// Wall rule: outdoors the walkable floor is LAYOUT.groundY at every x
// (enforced by physicsSystem), so outdoor entities always walk in the
// road/sidewalk band visually in FRONT of the buildings; building interiors
// above street level can never be stood in from outside, which makes walls
// solid by construction.
//
// Doorway rule (symmetric for both buildings, rectangles in LAYOUT):
//   - Entry: an OUTDOOR entity moving up (velocity.y > 0) whose BODY overlaps
//     a building's doorway rect (feet x inside the doorway x-range AND body
//     AABB intersecting the doorway y-band) transitions to that building's
//     floor 0. The natural case is standing at groundY in the doorway and
//     jumping; a mid-air body passing above the y-band is not kidnapped.
//   - Exit: an INDOOR entity that is GROUNDED on floor 0, with feet x inside
//     its building's doorway x-range, and moving down (velocity.y < 0)
//     transitions back outdoors at groundY. Mid-air descent through the
//     doorway never ejects — exit requires deliberate grounded down intent.
//   The other way onto upper floors is the right building ladder (climbing
//   mode, handled by climbSystem).
//
// Intent consumption: physicsSystem deliberately preserves downward velocity
// while grounded so this system can read a controller's down intent for the
// exit rule. Any grounded downward velocity that did NOT trigger an exit is
// zeroed here, so stale intent cannot eject the entity when it later crosses
// a doorway.
//
// Climbing entities are skipped here; climbSystem constrains them to the
// ladder/stairs ranges.
function bodyOverlapsDoorway(position, body, doorway) {
  return (
    position.x >= doorway.minX &&
    position.x < doorway.maxX &&
    position.y < doorway.maxY &&
    position.y + body.height > doorway.minY
  );
}

export function createBoundsSystem(world) {
  const matches = [];

  return {
    update() {
      world.queryInto(QUERY, matches);
      for (let i = 0; i < matches.length; i++) {
        const id = matches[i];
        const position = world.getComponent(id, Components.Position);
        const velocity = world.getComponent(id, Components.Velocity);
        const body = world.getComponent(id, Components.Body);
        const grounded = world.getComponent(id, Components.Grounded);
        const climbing = world.getComponent(id, Components.Climbing);
        const inside = world.getComponent(id, Components.InsideBuilding);

        if (climbing.mode !== ClimbingModes.NONE) {
          continue;
        }

        const halfWidth = body.width / 2;

        if (inside.buildingId === null) {
          if (velocity.y > 0) {
            let entered = false;
            for (let d = 0; d < DOORWAY_BUILDING_IDS.length; d++) {
              const buildingId = DOORWAY_BUILDING_IDS[d];
              const doorway = LAYOUT.buildings[buildingId].doorway;
              if (!bodyOverlapsDoorway(position, body, doorway)) {
                continue;
              }
              inside.buildingId = buildingId;
              inside.floor = 0;
              position.y = LAYOUT.buildings[buildingId].floors[0].y;
              velocity.y = 0;
              grounded.value = true;
              grounded.floorId = getFloorId(inside);
              entered = true;
              break;
            }
            if (entered) {
              continue;
            }
          }
          if (grounded.value && velocity.y < 0) {
            velocity.y = 0;
          }
          if (position.x < halfWidth) {
            position.x = halfWidth;
          } else if (position.x > GAME_WIDTH - halfWidth) {
            position.x = GAME_WIDTH - halfWidth;
          }
          if (position.y < LAYOUT.bounds.bottom) {
            position.y = LAYOUT.bounds.bottom;
            if (velocity.y < 0) {
              velocity.y = 0;
            }
          } else if (position.y > LAYOUT.bounds.top) {
            position.y = LAYOUT.bounds.top;
            if (velocity.y > 0) {
              velocity.y = 0;
            }
          }
        } else {
          const building = LAYOUT.buildings[inside.buildingId];
          const doorway = building.doorway;
          if (
            inside.floor === 0 &&
            grounded.value &&
            velocity.y < 0 &&
            position.x >= doorway.minX &&
            position.x < doorway.maxX
          ) {
            inside.buildingId = null;
            inside.floor = 0;
            position.y = LAYOUT.groundY;
            velocity.y = 0;
            grounded.value = true;
            grounded.floorId = OUTDOOR_FLOOR_ID;
            continue;
          }
          if (grounded.value && velocity.y < 0) {
            velocity.y = 0;
          }
          const minX = building.minX + halfWidth;
          const maxX = building.maxX - halfWidth;
          if (position.x < minX) {
            position.x = minX;
          } else if (position.x > maxX) {
            position.x = maxX;
          }
          const floorY = getFloorY(inside);
          if (position.y < floorY) {
            position.y = floorY;
          } else if (position.y > building.maxY) {
            position.y = building.maxY;
            if (velocity.y > 0) {
              velocity.y = 0;
            }
          }
        }
      }
    },
  };
}
