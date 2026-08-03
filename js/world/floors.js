import { LAYOUT } from './layout.js';

export const OUTDOOR_FLOOR_ID = 'ground';

export function getFloorY(insideBuilding) {
  if (insideBuilding.buildingId === null) {
    return LAYOUT.groundY;
  }
  return LAYOUT.buildings[insideBuilding.buildingId].floors[insideBuilding.floor].y;
}

export function getFloorId(insideBuilding) {
  if (insideBuilding.buildingId === null) {
    return OUTDOOR_FLOOR_ID;
  }
  return insideBuilding.buildingId + ':' + insideBuilding.floor;
}

export function getNearestFloorIndex(buildingId, y) {
  const floors = LAYOUT.buildings[buildingId].floors;
  let best = 0;
  let bestDistance = Math.abs(y - floors[0].y);
  for (let i = 1; i < floors.length; i++) {
    const distance = Math.abs(y - floors[i].y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

export const DISMOUNT_SNAP_EPSILON = 16;

// dismountFromClimbable — stepping off a ladder/stairs mid-climb. The feet
// can sit anywhere between two floor lines, while physicsSystem always lands
// an entity on InsideBuilding.floor — snapping UP to the nearest floor from
// as much as half a floor gap away produced ~60px teleports. Rule now:
//   - within DISMOUNT_SNAP_EPSILON of the NEAREST floor line: snap exactly
//     onto it (a real landing).
//   - otherwise: retarget InsideBuilding.floor to the highest floor at or
//     below the feet so the entity simply FALLS with gravity onto it.
// Outdoors (buildingId null) there is only the ground — nothing to do.
export function dismountFromClimbable(position, inside) {
  if (inside.buildingId === null) {
    return;
  }
  const floors = LAYOUT.buildings[inside.buildingId].floors;
  const nearest = getNearestFloorIndex(inside.buildingId, position.y);
  if (Math.abs(position.y - floors[nearest].y) <= DISMOUNT_SNAP_EPSILON) {
    position.y = floors[nearest].y;
    inside.floor = nearest;
    return;
  }
  let below = 0;
  for (let i = 1; i < floors.length; i++) {
    if (floors[i].y <= position.y) {
      below = i;
    }
  }
  inside.floor = below;
}
