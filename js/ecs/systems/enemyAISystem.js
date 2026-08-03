import {
  Components,
  GameStates,
  ClimbingModes,
  BuildingIds,
  FacingDirs,
  EnemyAIStates,
  createBoundsConstrained,
} from '../components.js';
import { LAYOUT, GAME_WIDTH } from '../../world/layout.js';
import { sameZoneContext } from '../../world/zone.js';

const CLIMB_SPEED = 80;
const DOORWAY_INTENT_SPEED = 180;
// Engage range must be <= contact range: collisionSystem needs a strict AABB
// overlap (|dx| < (bodyWidth + playerWidth) / 2), so the AI keeps walking
// until the bodies actually touch — a positive padding stranded enemies 6px
// short of a stationary player forever.
const ATTACK_RANGE_PADDING = -2;
const ATTACK_Y_TOLERANCE = 32;
const GIVE_UP_INTERVAL = 3;
const GIVE_UP_CHANCE = 0.3;
const PLAYER_BODY_WIDTH = 24;

const QUERY = Object.freeze([
  Components.Enemy,
  Components.EnemyAI,
  Components.Position,
  Components.Velocity,
  Components.Body,
  Components.Climbing,
  Components.InsideBuilding,
  Components.Facing,
  Components.Attacking,
]);

// EnemyAISystem — Phase 7 behavior. Writes Velocity / Climbing / Facing /
// Attacking exactly like playerControllerSystem does from input, so the
// existing doorway (boundsSystem) and climbable (climbSystem) mechanisms work
// unchanged. Runs after the controller, before physics.
//
// Routing:
//   - Same zone context as the player: walk at the player; adjacent -> attack
//     (cosmetic anim — contact itself is fatal via collisionSystem).
//   - Outdoor, player inside the RIGHT building: walk to the exterior ladder
//     and climb to the player's floor.
//   - Outdoor, player inside the LEFT building: walk to the doorway, enter
//     (up intent), then stairs to the player's floor.
//   - Inside, player elsewhere: descend to floor 0 (stairs/ladder), exit
//     through the doorway (down intent), then pursue outdoors.
//   - Outdoor while the player is indoors: every GIVE_UP_INTERVAL seconds a
//     GIVE_UP_CHANCE roll switches the enemy to 'flee' — it drops its
//     BoundsConstrained and walks off-screen, where spawnSystem vanishes it
//     (no score) and queues a same-type replacement.
//
// `random` is injectable for deterministic tests.
export function createEnemyAISystem(world, { random = Math.random } = {}) {
  const matches = [];

  function getGameState() {
    const gameId = world.queryFirst(Components.GameState);
    return gameId === undefined
      ? null
      : world.getComponent(gameId, Components.GameState);
  }

  function walkToward(x, position, velocity, facing, speed) {
    const dx = x - position.x;
    if (Math.abs(dx) < 1) {
      velocity.x = 0;
      return;
    }
    velocity.x = dx < 0 ? -speed : speed;
    facing.dir = dx < 0 ? FacingDirs.LEFT : FacingDirs.RIGHT;
  }

  function walkToClimbable(range, position, velocity, facing, speed) {
    if (position.x >= range.minX && position.x < range.maxX) {
      return true;
    }
    walkToward((range.minX + range.maxX) / 2, position, velocity, facing, speed);
    return false;
  }

  return {
    update(dt) {
      const gameState = getGameState();
      if (gameState !== null && gameState.current !== GameStates.PLAYING) {
        return;
      }

      const playerId = world.queryFirst(Components.Player);
      const playerAlive =
        playerId !== undefined && !world.hasComponent(playerId, Components.Dead);
      const playerPosition = playerAlive
        ? world.getComponent(playerId, Components.Position)
        : null;
      const playerInside = playerAlive
        ? world.getComponent(playerId, Components.InsideBuilding)
        : null;

      world.queryInto(QUERY, matches);
      for (let i = 0; i < matches.length; i++) {
        const id = matches[i];
        const enemy = world.getComponent(id, Components.Enemy);
        const ai = world.getComponent(id, Components.EnemyAI);
        const position = world.getComponent(id, Components.Position);
        const velocity = world.getComponent(id, Components.Velocity);
        const body = world.getComponent(id, Components.Body);
        const climbing = world.getComponent(id, Components.Climbing);
        const inside = world.getComponent(id, Components.InsideBuilding);
        const facing = world.getComponent(id, Components.Facing);
        const attacking = world.getComponent(id, Components.Attacking);
        const speed = enemy.speed;

        if (ai.state === EnemyAIStates.FLEE) {
          if (world.hasComponent(id, Components.BoundsConstrained)) {
            world.removeComponent(id, Components.BoundsConstrained);
          }
          attacking.active = false;
          velocity.x = ai.fleeDir * speed;
          velocity.y = 0;
          facing.dir = ai.fleeDir < 0 ? FacingDirs.LEFT : FacingDirs.RIGHT;
          continue;
        }

        if (!playerAlive) {
          attacking.active = false;
          velocity.x = 0;
          if (climbing.mode === ClimbingModes.NONE) {
            velocity.y = 0;
          }
          continue;
        }

        // Fresh off-screen walk-ins regain BoundsConstrained once fully
        // inside the scene (spawnSystem strips it at the outdoor edges so
        // boundsSystem never teleports them into view).
        if (
          !world.hasComponent(id, Components.BoundsConstrained) &&
          position.x > body.width / 2 &&
          position.x < GAME_WIDTH - body.width / 2
        ) {
          world.addComponent(id, Components.BoundsConstrained, createBoundsConstrained());
        }

        if (climbing.mode !== ClimbingModes.NONE) {
          ai.state = EnemyAIStates.CLIMB;
          attacking.active = false;
          const buildingId =
            climbing.mode === ClimbingModes.LADDER
              ? BuildingIds.RIGHT
              : BuildingIds.LEFT;
          const targetFloor =
            playerInside.buildingId === buildingId ? playerInside.floor : 0;
          if (inside.floor === targetFloor && !climbing.betweenFloors) {
            climbing.mode = ClimbingModes.NONE;
            climbing.betweenFloors = false;
            velocity.y = 0;
            continue;
          }
          const targetY = LAYOUT.buildings[buildingId].floors[targetFloor].y;
          velocity.x = 0;
          velocity.y = position.y < targetY ? CLIMB_SPEED : -CLIMB_SPEED;
          continue;
        }

        if (sameZoneContext(inside, playerInside)) {
          const dx = playerPosition.x - position.x;
          const range =
            (body.width + PLAYER_BODY_WIDTH) / 2 + ATTACK_RANGE_PADDING;
          if (
            Math.abs(dx) <= range &&
            Math.abs(playerPosition.y - position.y) < ATTACK_Y_TOLERANCE
          ) {
            ai.state = EnemyAIStates.ATTACK;
            attacking.active = true;
            velocity.x = 0;
            velocity.y = 0;
            if (dx !== 0) {
              facing.dir = dx < 0 ? FacingDirs.LEFT : FacingDirs.RIGHT;
            }
            continue;
          }
          ai.state = EnemyAIStates.SEEK;
          attacking.active = false;
          velocity.y = 0;
          walkToward(playerPosition.x, position, velocity, facing, speed);
          continue;
        }

        ai.state = EnemyAIStates.SEEK;
        attacking.active = false;

        if (inside.buildingId === null) {
          // Outdoors; the player is indoors (same context was handled above).
          ai.thinkTimer -= dt;
          if (ai.thinkTimer <= 0) {
            ai.thinkTimer = GIVE_UP_INTERVAL;
            if (random() < GIVE_UP_CHANCE) {
              ai.state = EnemyAIStates.FLEE;
              ai.fleeDir = position.x < GAME_WIDTH / 2 ? -1 : 1;
              world.removeComponent(id, Components.BoundsConstrained);
              velocity.x = ai.fleeDir * speed;
              velocity.y = 0;
              facing.dir = ai.fleeDir < 0 ? FacingDirs.LEFT : FacingDirs.RIGHT;
              continue;
            }
          }
          if (playerInside.buildingId === BuildingIds.RIGHT) {
            const ladder = LAYOUT.buildings.right.ladder;
            if (walkToClimbable(ladder, position, velocity, facing, speed)) {
              ai.state = EnemyAIStates.CLIMB;
              climbing.mode = ClimbingModes.LADDER;
              climbing.betweenFloors = false;
              velocity.x = 0;
              velocity.y = CLIMB_SPEED;
            }
          } else {
            const doorway = LAYOUT.buildings.left.doorway;
            if (walkToClimbable(doorway, position, velocity, facing, speed)) {
              velocity.x = 0;
              velocity.y = DOORWAY_INTENT_SPEED;
            }
          }
          continue;
        }

        if (inside.buildingId === playerInside.buildingId) {
          // Same building, another floor: take this building's climbable.
          const range =
            inside.buildingId === BuildingIds.LEFT
              ? LAYOUT.buildings.left.stairs
              : LAYOUT.buildings.right.ladder;
          if (walkToClimbable(range, position, velocity, facing, speed)) {
            ai.state = EnemyAIStates.CLIMB;
            climbing.mode =
              inside.buildingId === BuildingIds.LEFT
                ? ClimbingModes.STAIRS
                : ClimbingModes.LADDER;
            climbing.betweenFloors = false;
            velocity.x = 0;
            const targetY =
              LAYOUT.buildings[inside.buildingId].floors[playerInside.floor].y;
            velocity.y = position.y < targetY ? CLIMB_SPEED : -CLIMB_SPEED;
          }
          continue;
        }

        // Player is outdoors or in the other building: leave this building.
        if (inside.floor !== 0) {
          const range =
            inside.buildingId === BuildingIds.LEFT
              ? LAYOUT.buildings.left.stairs
              : LAYOUT.buildings.right.ladder;
          if (walkToClimbable(range, position, velocity, facing, speed)) {
            ai.state = EnemyAIStates.CLIMB;
            climbing.mode =
              inside.buildingId === BuildingIds.LEFT
                ? ClimbingModes.STAIRS
                : ClimbingModes.LADDER;
            climbing.betweenFloors = false;
            velocity.x = 0;
            velocity.y = -CLIMB_SPEED;
          }
          continue;
        }
        const doorway = LAYOUT.buildings[inside.buildingId].doorway;
        if (walkToClimbable(doorway, position, velocity, facing, speed)) {
          velocity.x = 0;
          velocity.y = -DOORWAY_INTENT_SPEED;
        }
      }
    },
  };
}
