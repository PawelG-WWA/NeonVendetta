import { Components, ClimbingModes, Teams } from '../components.js';
import { isTangible, sameZoneContext, bodiesOverlap } from '../../world/zone.js';

const DAMAGEABLE_QUERY = Object.freeze([
  Components.Health,
  Components.Position,
  Components.Body,
  Components.InsideBuilding,
  Components.Climbing,
]);

const TEAM_QUERY = Object.freeze([
  Components.Team,
  Components.Position,
  Components.Body,
  Components.InsideBuilding,
  Components.Climbing,
]);

const PROJECTILE_QUERY = Object.freeze([
  Components.Projectile,
  Components.Position,
  Components.Body,
]);

// CollisionSystem — broadphase AABB detection between entities that share a
// zone context (see world/zone.js for the tangibility rules). Runs after
// boundsSystem, before damageSystem; it only DETECTS and reports pairs —
// resolution (damage, death, projectile destruction) is damageSystem's job.
export function createCollisionSystem(world) {
  const entities = [];
  const projectiles = [];
  const projectileHits = [];
  const playerEnemyOverlaps = [];
  let projectileHitCount = 0;
  let playerEnemyOverlapCount = 0;

  function pushProjectileHit(projectile, target) {
    let pair = projectileHits[projectileHitCount];
    if (pair === undefined) {
      pair = { projectile: 0, target: 0 };
      projectileHits.push(pair);
    }
    pair.projectile = projectile;
    pair.target = target;
    projectileHitCount += 1;
  }

  function pushPlayerEnemyOverlap(player, enemy) {
    let pair = playerEnemyOverlaps[playerEnemyOverlapCount];
    if (pair === undefined) {
      pair = { player: 0, enemy: 0 };
      playerEnemyOverlaps.push(pair);
    }
    pair.player = player;
    pair.enemy = enemy;
    playerEnemyOverlapCount += 1;
  }

  // Ladder tangibility (see zone.js): the right-building ladder is exterior,
  // so a climber is tangible to a context in the SAME building OR outdoors
  // (buildingId null). Cross-building isolation still holds.
  function isLadderCrossFloor(aInside, aClimbing, bInside, bClimbing) {
    const aOnLadder = aClimbing.mode === ClimbingModes.LADDER;
    const bOnLadder = bClimbing.mode === ClimbingModes.LADDER;
    if (!aOnLadder && !bOnLadder) {
      return false;
    }
    if (aInside.buildingId === null || bInside.buildingId === null) {
      return true;
    }
    return aInside.buildingId === bInside.buildingId;
  }

  function projectileContextAllows(context, inside, climbing) {
    // Guarded path: createProjectile defaults context to null — a contextless
    // projectile is inert (pinned by the null-context test).
    if (context === null) {
      return false;
    }
    if (sameZoneContext(context, inside)) {
      return true;
    }
    return (
      climbing.mode === ClimbingModes.LADDER &&
      (context.buildingId === null || context.buildingId === inside.buildingId)
    );
  }

  function contextAllows(aInside, aClimbing, bInside, bClimbing) {
    return (
      sameZoneContext(aInside, bInside) ||
      isLadderCrossFloor(aInside, aClimbing, bInside, bClimbing)
    );
  }

  return {
    update() {
      projectileHitCount = 0;
      playerEnemyOverlapCount = 0;

      world.queryInto(TEAM_QUERY, entities);
      for (let i = 0; i < entities.length; i++) {
        const a = entities[i];
        const aInside = world.getComponent(a, Components.InsideBuilding);
        const aClimbing = world.getComponent(a, Components.Climbing);
        if (!isTangible(aClimbing)) {
          continue;
        }
        const aTeam = world.getComponent(a, Components.Team).side;
        const aPos = world.getComponent(a, Components.Position);
        const aBody = world.getComponent(a, Components.Body);

        for (let j = i + 1; j < entities.length; j++) {
          const b = entities[j];
          const bTeam = world.getComponent(b, Components.Team).side;
          if (aTeam === bTeam) {
            continue;
          }
          const bClimbing = world.getComponent(b, Components.Climbing);
          if (!isTangible(bClimbing)) {
            continue;
          }
          const bInside = world.getComponent(b, Components.InsideBuilding);
          if (!contextAllows(aInside, aClimbing, bInside, bClimbing)) {
            continue;
          }
          const bPos = world.getComponent(b, Components.Position);
          const bBody = world.getComponent(b, Components.Body);
          if (!bodiesOverlap(aPos.x, aPos.y, aBody, bPos.x, bPos.y, bBody)) {
            continue;
          }
          if (aTeam === Teams.PLAYER) {
            pushPlayerEnemyOverlap(a, b);
          } else {
            pushPlayerEnemyOverlap(b, a);
          }
        }
      }

      world.queryInto(PROJECTILE_QUERY, projectiles);
      for (let p = 0; p < projectiles.length; p++) {
        const projId = projectiles[p];
        const projectile = world.getComponent(projId, Components.Projectile);
        const projPos = world.getComponent(projId, Components.Position);
        const projBody = world.getComponent(projId, Components.Body);

        world.queryInto(DAMAGEABLE_QUERY, entities);
        for (let i = 0; i < entities.length; i++) {
          const id = entities[i];
          if (id === projId) {
            continue;
          }
          const climbing = world.getComponent(id, Components.Climbing);
          if (!isTangible(climbing)) {
            continue;
          }
          const inside = world.getComponent(id, Components.InsideBuilding);
          if (!projectileContextAllows(projectile.context, inside, climbing)) {
            continue;
          }
          const pos = world.getComponent(id, Components.Position);
          const body = world.getComponent(id, Components.Body);
          if (bodiesOverlap(projPos.x, projPos.y, projBody, pos.x, pos.y, body)) {
            pushProjectileHit(projId, id);
            break;
          }
        }
      }
    },

    getProjectileHits() {
      projectileHits.length = projectileHitCount;
      return projectileHits;
    },

    getPlayerEnemyOverlaps() {
      playerEnemyOverlaps.length = playerEnemyOverlapCount;
      return playerEnemyOverlaps;
    },
  };
}
