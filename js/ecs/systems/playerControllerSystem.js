import {
  Components,
  GameStates,
  ClimbingModes,
  BuildingIds,
  FacingDirs,
} from '../components.js';
import { LAYOUT } from '../../world/layout.js';
import { dismountFromClimbable } from '../../world/floors.js';

const WALK_SPEED = 140;
const CLIMB_SPEED = 90;
const DOORWAY_INTENT_SPEED = 180;
const GROUND_EPSILON = 1;

const KEY_LEFT = 'KeyA';
const KEY_RIGHT = 'KeyD';
const KEY_UP = 'KeyW';
const KEY_DOWN = 'KeyS';

const HORIZONTAL_KEYS = new Set([KEY_LEFT, KEY_RIGHT]);
const ARROW_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
const ARROW_DIRECTIONS = Object.freeze({
  ArrowLeft: FacingDirs.LEFT,
  ArrowRight: FacingDirs.RIGHT,
  ArrowUp: FacingDirs.UP,
  ArrowDown: FacingDirs.DOWN,
});

const QUERY = Object.freeze([
  Components.Player,
  Components.Position,
  Components.Velocity,
  Components.Grounded,
  Components.Climbing,
  Components.InsideBuilding,
  Components.Facing,
  Components.Shooting,
]);

// Most-recent still-held key among `codes`: InputState.pressed is a Set in
// keydown insertion order (keys are deleted on release, re-inserted on
// re-press), so the LAST matching code in iteration order is the most
// recently pressed one. This gives "no diagonals — most recent wins".
function lastPressed(pressed, codes) {
  let found = null;
  for (const code of pressed) {
    if (codes.has(code)) {
      found = code;
    }
  }
  return found;
}

// PlayerControllerSystem — translates keyboard input into Velocity / Climbing
// / Facing / Shooting component state. Runs after inputSystem, before
// physicsSystem. No jump: vertical movement is ladders / stairs / doorway
// intent only.
//
// Doorway intent protocol (Phase 3 mechanism — do not fight it):
//   - W outdoors (grounded) sets a one-shot upward impulse on justPressed;
//     boundsSystem converts it into a doorway entry when the body overlaps a
//     doorway rect, otherwise gravity settles the hop back to the ground.
//   - S (held, grounded) sets a fresh downward intent every tick;
//     boundsSystem either consumes it as a doorway exit (indoor floor 0 in a
//     doorway x-range) or zeroes it. The controller never zeroes stale intent
//     itself — that is boundsSystem's job.
export function createPlayerControllerSystem(world) {
  const matches = [];

  function getInput() {
    const inputId = world.queryFirst(Components.InputState);
    return inputId === undefined
      ? null
      : world.getComponent(inputId, Components.InputState);
  }

  function isPlaying() {
    const gameId = world.queryFirst(Components.GameState);
    if (gameId === undefined) {
      return true;
    }
    return world.getComponent(gameId, Components.GameState).current === GameStates.PLAYING;
  }

  return {
    update() {
      if (!isPlaying()) {
        return;
      }
      const input = getInput();
      if (input === null) {
        return;
      }
      const pressed = input.pressed;

      world.queryInto(QUERY, matches);
      for (let i = 0; i < matches.length; i++) {
        const id = matches[i];
        const position = world.getComponent(id, Components.Position);
        const velocity = world.getComponent(id, Components.Velocity);
        const grounded = world.getComponent(id, Components.Grounded);
        const climbing = world.getComponent(id, Components.Climbing);
        const inside = world.getComponent(id, Components.InsideBuilding);
        const facing = world.getComponent(id, Components.Facing);
        const shooting = world.getComponent(id, Components.Shooting);

        const moveKey = lastPressed(pressed, HORIZONTAL_KEYS);
        const arrowKey = lastPressed(pressed, ARROW_KEYS);
        const up = pressed.has(KEY_UP);
        const down = pressed.has(KEY_DOWN);

        shooting.active = arrowKey !== null;
        if (arrowKey !== null) {
          facing.dir = ARROW_DIRECTIONS[arrowKey];
        } else if (moveKey !== null) {
          facing.dir = moveKey === KEY_LEFT ? FacingDirs.LEFT : FacingDirs.RIGHT;
        }

        const ladder = LAYOUT.buildings.right.ladder;
        const stairs = LAYOUT.buildings.left.stairs;

        if (climbing.mode === ClimbingModes.LADDER) {
          if (moveKey !== null) {
            climbing.mode = ClimbingModes.NONE;
            climbing.betweenFloors = false;
            dismountFromClimbable(position, inside);
            velocity.x = moveKey === KEY_LEFT ? -WALK_SPEED : WALK_SPEED;
            velocity.y = 0;
          } else {
            velocity.x = 0;
            velocity.y = up ? CLIMB_SPEED : down ? -CLIMB_SPEED : 0;
            if (down && position.y <= ladder.minY + GROUND_EPSILON) {
              climbing.mode = ClimbingModes.NONE;
              climbing.betweenFloors = false;
              velocity.y = 0;
            }
          }
          continue;
        }

        if (climbing.mode === ClimbingModes.STAIRS) {
          if (moveKey !== null) {
            climbing.mode = ClimbingModes.NONE;
            climbing.betweenFloors = false;
            dismountFromClimbable(position, inside);
            velocity.x = moveKey === KEY_LEFT ? -WALK_SPEED : WALK_SPEED;
            velocity.y = 0;
          } else {
            velocity.x = 0;
            velocity.y = up ? CLIMB_SPEED : down ? -CLIMB_SPEED : 0;
            if (down && position.y <= stairs.minY + GROUND_EPSILON) {
              climbing.mode = ClimbingModes.NONE;
              climbing.betweenFloors = false;
              velocity.y = 0;
            }
          }
          continue;
        }

        const atLadder =
          (inside.buildingId === null || inside.buildingId === BuildingIds.RIGHT) &&
          position.x >= ladder.minX &&
          position.x < ladder.maxX;
        const atStairs =
          inside.buildingId === BuildingIds.LEFT &&
          position.x >= stairs.minX &&
          position.x < stairs.maxX;

        if (atLadder && (up || (down && position.y > ladder.minY + GROUND_EPSILON))) {
          climbing.mode = ClimbingModes.LADDER;
          climbing.betweenFloors = false;
          velocity.x = 0;
          velocity.y = up ? CLIMB_SPEED : -CLIMB_SPEED;
          continue;
        }
        if (atStairs && (up || (down && position.y > stairs.minY + GROUND_EPSILON))) {
          climbing.mode = ClimbingModes.STAIRS;
          climbing.betweenFloors = false;
          velocity.x = 0;
          velocity.y = up ? CLIMB_SPEED : -CLIMB_SPEED;
          continue;
        }

        velocity.x = moveKey === KEY_LEFT
          ? -WALK_SPEED
          : moveKey === KEY_RIGHT
            ? WALK_SPEED
            : 0;

        if (grounded.value) {
          if (inside.buildingId === null) {
            // Outdoor W is a doorway-entry intent only — gate the impulse to
            // actual doorway x-ranges (both buildings) so W elsewhere does
            // nothing (no hop).
            const inDoorwayX =
              (position.x >= LAYOUT.buildings.left.doorway.minX &&
                position.x < LAYOUT.buildings.left.doorway.maxX) ||
              (position.x >= LAYOUT.buildings.right.doorway.minX &&
                position.x < LAYOUT.buildings.right.doorway.maxX);
            if (inDoorwayX && input.justPressed.has(KEY_UP)) {
              velocity.y = DOORWAY_INTENT_SPEED;
            } else if (down) {
              velocity.y = -DOORWAY_INTENT_SPEED;
            }
          } else if (down) {
            velocity.y = -DOORWAY_INTENT_SPEED;
          }
        }
      }
    },
  };
}
