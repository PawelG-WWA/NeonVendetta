import {
  Components,
  GameStates,
  AnimStates,
  createHitFlash,
  createDead,
} from '../components.js';
import { ENEMY_DEFS, EnemyTypes, createHitSpark } from '../factories.js';

export const HIT_FLASH_DURATION = 0.12;
export const ENEMY_DEATH_DURATION = 0.8;
export const PLAYER_DEATH_DURATION = 1.2;
export const KILL_SCORE = ENEMY_DEFS[EnemyTypes.SIMPLE].scoreValue;

const PLAYER_DEATH_SHEET = 'assets/player_death.png';
const PLAYER_DEATH_FRAME_W = 32;
const PLAYER_DEATH_FRAME_H = 48;
const PLAYER_DEATH_COLS = 8;
const PLAYER_DEATH_ROWS = 1;

const DEAD_QUERY = Object.freeze([Components.Dead]);

// DamageSystem — resolves the pairs collisionSystem detected.
//   - projectile vs Health entity: hp -= damage, brief HitFlash, projectile
//     destroyed. hp <= 0 -> Dead: sprite swaps to the type's death sheet
//     (enemy 4x2 8f 32x48, enemy2 5x2 10f 40x56, enemy3 4x2 8f 48x64 —
//     per-type grids come from ENEMY_DEFS via the Enemy component), physics/
//     collision components are stripped (corpse is intangible and immobile),
//     and the entity is destroyed once the death anim has run.
//     Enemy kills add the type's scoreValue to the game Score and increment
//     KillStats (spawnSystem's difficulty input).
//   - enemy touches player (no Health — one hit is fatal): controls lock,
//     player_death.png plays, then GameState is requested to GAME_OVER.
// Re-entrancy: an entity already carrying Dead is never re-processed.
// Bullets never pierce: every resolved projectile pair destroys the
// projectile, even when the target was already dying (second bullet landing
// the same tick).
export function createDamageSystem(world, collisionSystem) {
  const deadEntities = [];

  function addScore(points) {
    const scoreId = world.queryFirst(Components.Score);
    if (scoreId !== undefined) {
      world.getComponent(scoreId, Components.Score).value += points;
    }
  }

  function addKill() {
    const statsId = world.queryFirst(Components.KillStats);
    if (statsId !== undefined) {
      world.getComponent(statsId, Components.KillStats).kills += 1;
    }
  }

  function requestGameOver() {
    const gameId = world.queryFirst(Components.GameState);
    if (gameId !== undefined) {
      world.getComponent(gameId, Components.GameState).request = GameStates.GAME_OVER;
    }
  }

  function beginDeath(id, sheet, duration, cols, rows, frameW, frameH) {
    const dead = world.getComponent(id, Components.Dead);
    if (dead !== undefined) {
      return dead;
    }
    const created = world.addComponent(id, Components.Dead, createDead(duration));

    const anim = world.getComponent(id, Components.AnimState);
    if (anim !== undefined) {
      anim.state = AnimStates.DEATH;
      anim.frame = 0;
      anim.timer = 0;
    }
    const sprite = world.getComponent(id, Components.Sprite);
    if (sprite !== undefined) {
      sprite.sheet = sheet;
      sprite.frameW = frameW;
      sprite.frameH = frameH;
      sprite.cols = cols;
      sprite.rows = rows;
      sprite.flipX = false;
    }
    const renderable = world.getComponent(id, Components.Renderable);
    if (renderable !== undefined) {
      renderable.texturePath = sheet;
    }
    world.removeComponent(id, Components.Gravity);
    world.removeComponent(id, Components.Climbing);
    world.removeComponent(id, Components.InsideBuilding);
    world.removeComponent(id, Components.BoundsConstrained);
    world.removeComponent(id, Components.Velocity);
    return created;
  }

  return {
    update(dt) {
      const hits = collisionSystem.getProjectileHits();
      for (let i = 0; i < hits.length; i++) {
        const projId = hits[i].projectile;
        const targetId = hits[i].target;
        const health = world.getComponent(targetId, Components.Health);
        if (health !== undefined && !world.hasComponent(targetId, Components.Dead)) {
          const projectile = world.getComponent(projId, Components.Projectile);
          if (projectile !== undefined) {
            health.hp -= projectile.damage;
          }
          if (health.hp <= 0) {
            const enemy = world.getComponent(targetId, Components.Enemy);
            const def = enemy !== undefined
              ? ENEMY_DEFS[enemy.type]
              : ENEMY_DEFS[EnemyTypes.SIMPLE];
            beginDeath(
              targetId,
              def.sheets.death,
              ENEMY_DEATH_DURATION,
              def.deathCols,
              def.deathRows,
              def.frameWidth,
              def.frameHeight
            );
            addScore(enemy !== undefined ? enemy.scoreValue : def.scoreValue);
            addKill();
          } else if (world.hasComponent(targetId, Components.HitFlash)) {
            world.getComponent(targetId, Components.HitFlash).timer = HIT_FLASH_DURATION;
          } else {
            world.addComponent(targetId, Components.HitFlash, createHitFlash(HIT_FLASH_DURATION));
          }
        }
        // Every resolved pair is an impact: hit spark at the bullet's center,
        // then the bullet is gone (no piercing — even into a dying target).
        // The spark inherits the projectile's frozen zone context so an
        // indoor impact renders behind the facade mask.
        const projPos = world.getComponent(projId, Components.Position);
        if (projPos !== undefined) {
          const projBody = world.getComponent(projId, Components.Body);
          const impact = world.getComponent(projId, Components.Projectile);
          createHitSpark(
            world,
            projPos.x,
            projPos.y + (projBody !== undefined ? projBody.height / 2 : 0),
            impact !== undefined ? impact.context : null
          );
        }
        world.destroyEntity(projId);
      }

      const overlaps = collisionSystem.getPlayerEnemyOverlaps();
      for (let i = 0; i < overlaps.length; i++) {
        const playerId = overlaps[i].player;
        const enemyId = overlaps[i].enemy;
        if (world.hasComponent(playerId, Components.Dead)) {
          continue;
        }
        if (!world.hasComponent(enemyId, Components.Team) ||
            world.hasComponent(enemyId, Components.Dead)) {
          continue;
        }
        beginDeath(
          playerId,
          PLAYER_DEATH_SHEET,
          PLAYER_DEATH_DURATION,
          PLAYER_DEATH_COLS,
          PLAYER_DEATH_ROWS,
          PLAYER_DEATH_FRAME_W,
          PLAYER_DEATH_FRAME_H
        );
        world.removeComponent(playerId, Components.Shooting);
        world.removeComponent(playerId, Components.Weapon);
      }

      deadEntities.length = 0;
      world.queryInto(DEAD_QUERY, deadEntities);
      for (let i = 0; i < deadEntities.length; i++) {
        const id = deadEntities[i];
        const dead = world.getComponent(id, Components.Dead);
        dead.timer -= dt;
        if (dead.timer > 0) {
          continue;
        }
        if (world.hasComponent(id, Components.Player)) {
          world.removeComponent(id, Components.Dead);
          requestGameOver();
        } else {
          world.destroyEntity(id);
        }
      }
    },
  };
}
