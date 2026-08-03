// Zone context — collision partitioning (Phase 5). Two entities share a zone
// context only if they can meaningfully touch: both outdoors, or inside the
// SAME building on the SAME floor.
//
// Tangibility exceptions (game design):
//   - Stairs: an entity with Climbing.mode 'stairs' AND betweenFloors is
//     INTANGIBLE — enemies crossing stairwells cannot hit the player.
//     Snapped on a stair landing the entity reads as standing on that floor.
//   - Ladder: an entity on a ladder is always TANGIBLE and collides across
//     floors with any tangible entity whose body overlaps it, provided the
//     other context is the SAME building as the climber OR the outdoors
//     (buildingId null) — the right-building ladder is exterior and mounts
//     from the street, so outdoor bodies and bullets reach climbers.
//     Cross-building isolation still holds (left never reaches right).
import { ClimbingModes } from '../ecs/components.js';

export function zoneContextOf(inside) {
  return { buildingId: inside.buildingId, floor: inside.floor };
}

export function isTangible(climbing) {
  return !(climbing.mode === ClimbingModes.STAIRS && climbing.betweenFloors);
}

export function sameZoneContext(a, b) {
  if (a.buildingId === null || b.buildingId === null) {
    return a.buildingId === b.buildingId;
  }
  return a.buildingId === b.buildingId && a.floor === b.floor;
}

export function bodiesOverlap(ax, ay, aBody, bx, by, bBody) {
  return (
    Math.abs(ax - bx) * 2 < aBody.width + bBody.width &&
    ay < by + bBody.height &&
    by < ay + aBody.height
  );
}
