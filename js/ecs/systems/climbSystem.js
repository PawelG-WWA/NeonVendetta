import { Components, ClimbingModes, BuildingIds } from '../components.js';
import { LAYOUT } from '../../world/layout.js';
import { getNearestFloorIndex, dismountFromClimbable } from '../../world/floors.js';

const FLOOR_SNAP_EPSILON = 0.5;

const QUERY = Object.freeze([
  Components.Position,
  Components.Velocity,
  Components.Body,
  Components.Climbing,
  Components.InsideBuilding,
]);

// ClimbSystem — ladder (right building) and stairs (left building) climbing.
//
// Engagement gating: a Climbing mode is honored only where the climbable
// actually exists. Invalid engagements are rejected by resetting the mode to
// 'none' — an entity is NEVER teleported across the map to the climbable.
//   - 'ladder': feet x must be inside the ladder x-range AND the entity must
//     be at the right building (outdoors at the ladder base, or inside it).
//   - 'stairs': the entity must be inside the left building AND feet x must
//     be inside the stairs x-range.
//
// Floor tracking: while climbing, InsideBuilding.floor follows the NEAREST
// floor to the feet Y (getNearestFloorIndex), so the floor index transitions
// at the MIDPOINT between two adjacent floors. Climbing.betweenFloors is true
// while the feet are more than FLOOR_SNAP_EPSILON away from the current
// floor's Y, and false when snapped onto a floor landing.
//
// Dismounts (controller walk-off, AI arrival, or the rejection path above)
// go through dismountFromClimbable (world/floors.js): snap onto the nearest
// floor only within a small epsilon, otherwise retarget the floor below the
// feet and fall with gravity — never a large upward pop.
//
// Clamps: horizontal position is clamped so the body stays inside the
// climbable's x-range; vertical position is clamped to the climbable's
// [minY, maxY], which spans floor 0 Y to top floor Y (see layout.js), so an
// entity clamped at the top reads as standing exactly on the top floor
// (inside.floor = top index, betweenFloors = false).
function isEngagementValid(mode, position, inside) {
  if (mode === ClimbingModes.LADDER) {
    const ladder = LAYOUT.buildings.right.ladder;
    const atRightBuilding =
      inside.buildingId === null || inside.buildingId === BuildingIds.RIGHT;
    return (
      atRightBuilding && position.x >= ladder.minX && position.x < ladder.maxX
    );
  }
  const stairs = LAYOUT.buildings.left.stairs;
  return (
    inside.buildingId === BuildingIds.LEFT &&
    position.x >= stairs.minX &&
    position.x < stairs.maxX
  );
}

export function createClimbSystem(world) {
  const matches = [];

  return {
    update() {
      world.queryInto(QUERY, matches);
      for (let i = 0; i < matches.length; i++) {
        const id = matches[i];
        const position = world.getComponent(id, Components.Position);
        const velocity = world.getComponent(id, Components.Velocity);
        const body = world.getComponent(id, Components.Body);
        const climbing = world.getComponent(id, Components.Climbing);
        const inside = world.getComponent(id, Components.InsideBuilding);

        if (climbing.mode === ClimbingModes.NONE) {
          if (climbing.betweenFloors) {
            climbing.betweenFloors = false;
          }
          continue;
        }

        if (!isEngagementValid(climbing.mode, position, inside)) {
          climbing.mode = ClimbingModes.NONE;
          climbing.betweenFloors = false;
          dismountFromClimbable(position, inside);
          continue;
        }

        const isLadder = climbing.mode === ClimbingModes.LADDER;
        const buildingId = isLadder ? BuildingIds.RIGHT : BuildingIds.LEFT;
        const range = isLadder
          ? LAYOUT.buildings.right.ladder
          : LAYOUT.buildings.left.stairs;

        inside.buildingId = buildingId;

        const halfWidth = body.width / 2;
        const minX = range.minX + halfWidth;
        const maxX = range.maxX - halfWidth;
        if (minX > maxX) {
          // Shaft narrower than the body: pin to the center line rather than
          // oscillating between the two impossible clamps.
          position.x = (range.minX + range.maxX) / 2;
          velocity.x = 0;
        } else if (position.x < minX) {
          position.x = minX;
          velocity.x = 0;
        } else if (position.x > maxX) {
          position.x = maxX;
          velocity.x = 0;
        }
        if (position.y < range.minY) {
          position.y = range.minY;
          if (velocity.y < 0) {
            velocity.y = 0;
          }
        } else if (position.y > range.maxY) {
          position.y = range.maxY;
          if (velocity.y > 0) {
            velocity.y = 0;
          }
        }

        const floorIndex = getNearestFloorIndex(buildingId, position.y);
        inside.floor = floorIndex;
        climbing.betweenFloors =
          Math.abs(position.y - LAYOUT.buildings[buildingId].floors[floorIndex].y) >
          FLOOR_SNAP_EPSILON;
      }
    },
  };
}
