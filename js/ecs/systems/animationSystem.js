import {
  Components,
  ClimbingModes,
  FacingDirs,
  AnimStates,
} from '../components.js';
import { ENEMY_DEFS, EnemyTypes } from '../factories.js';

// QUERY deliberately excludes Shooting/Attacking: enemies carry Attacking,
// the player carries Shooting — both are fetched optionally per entity.
const QUERY = Object.freeze([
  Components.AnimState,
  Components.Sprite,
  Components.Facing,
  Components.Velocity,
  Components.Climbing,
]);

// Sheet tables — player sheets are horizontal strips of 32x48 frames facing
// RIGHT (flipX mirrors for left). Enemy sheets are per-type grids (move 4x4
// 16f, attack/climb 4x2 8f) resolved from ENEMY_DEFS via the Enemy component.
// The 'death' state is OWNED by damageSystem / deathAnimSystem (Phase 5):
// this system never transitions into it and never touches an entity already
// in it.
const PLAYER_ANIM_DEFS = Object.freeze({
  [AnimStates.IDLE]: Object.freeze({ sheet: 'assets/player_idle.png', frames: 6, fps: 8, loop: true, cols: 0, rows: 1 }),
  [AnimStates.RUN]: Object.freeze({ sheet: 'assets/player_move.png', frames: 16, fps: 12, loop: true, cols: 0, rows: 1 }),
  [AnimStates.SHOOT]: Object.freeze({ sheet: 'assets/player_shoot.png', frames: 6, fps: 0, loop: false, cols: 0, rows: 1 }),
  [AnimStates.CLIMB]: Object.freeze({ sheet: 'assets/player_climb.png', frames: 6, fps: 8, loop: true, cols: 0, rows: 1 }),
  [AnimStates.DEATH]: Object.freeze({ sheet: 'assets/player_death.png', frames: 8, fps: 10, loop: false, cols: 0, rows: 1 }),
});

const ENEMY_MOVE_TIMING = Object.freeze({ frames: 16, fps: 12, loop: true });
const ENEMY_CLIMB_TIMING = Object.freeze({ frames: 8, fps: 10, loop: true });
const ENEMY_ATTACK_TIMING = Object.freeze({ frames: 8, fps: 10, loop: true });

function bindEnemySheet(sprite, def, state) {
  if (state === AnimStates.CLIMB) {
    sprite.sheet = def.sheets.climb;
    sprite.cols = def.climbCols;
    sprite.rows = def.climbRows;
    return ENEMY_CLIMB_TIMING;
  }
  if (state === AnimStates.ATTACK) {
    sprite.sheet = def.sheets.attack;
    sprite.cols = def.attackCols;
    sprite.rows = def.attackRows;
    return ENEMY_ATTACK_TIMING;
  }
  sprite.sheet = def.sheets.move;
  sprite.cols = def.moveCols;
  sprite.rows = def.moveRows;
  return ENEMY_MOVE_TIMING;
}

// player_shoot.png poses: 0=right, 1=left, 2=up, 3=down (4/5 are diagonal
// poses, unused — aiming has no diagonals). Poses encode direction, so flipX
// is forced off in the shoot state.
const SHOOT_POSES = Object.freeze({
  [FacingDirs.RIGHT]: 0,
  [FacingDirs.LEFT]: 1,
  [FacingDirs.UP]: 2,
  [FacingDirs.DOWN]: 3,
});

function resolveState(velocity, climbing, shooting, attacking) {
  if (climbing.mode !== ClimbingModes.NONE) {
    return AnimStates.CLIMB;
  }
  if (attacking !== undefined && attacking.active) {
    return AnimStates.ATTACK;
  }
  if (shooting !== undefined && shooting.active && velocity.x === 0) {
    return AnimStates.SHOOT;
  }
  if (velocity.x !== 0) {
    return AnimStates.RUN;
  }
  return AnimStates.IDLE;
}

function advance(anim, def, dt) {
  if (def.fps <= 0) {
    return;
  }
  anim.timer += dt;
  const frameDuration = 1 / def.fps;
  while (anim.timer >= frameDuration) {
    anim.timer -= frameDuration;
    if (def.loop) {
      anim.frame = (anim.frame + 1) % def.frames;
    } else if (anim.frame < def.frames - 1) {
      anim.frame += 1;
    }
  }
}

// AnimationSystem — maps component state (Climbing / Shooting / Attacking /
// Velocity / Facing) onto AnimState + Sprite. Runs at the fixed 60Hz step,
// after physics and bounds, so it reads the tick's resolved state. State
// changes reset the frame cursor; shoot is a static aim pose; climb advances
// only while moving on the climbable (paused frame when stationary on a
// ladder/stairs). Enemies bind per-type sheets from ENEMY_DEFS on every
// state change; the attack anim loops while the AI keeps Attacking raised.
export function createAnimationSystem(world) {
  const matches = [];

  return {
    update(dt) {
      world.queryInto(QUERY, matches);
      for (let i = 0; i < matches.length; i++) {
        const id = matches[i];
        if (world.hasComponent(id, Components.Dead)) {
          continue;
        }
        const anim = world.getComponent(id, Components.AnimState);
        const sprite = world.getComponent(id, Components.Sprite);
        const facing = world.getComponent(id, Components.Facing);
        const velocity = world.getComponent(id, Components.Velocity);
        const climbing = world.getComponent(id, Components.Climbing);
        const shooting = world.getComponent(id, Components.Shooting);
        const attacking = world.getComponent(id, Components.Attacking);

        const isPlayer = world.hasComponent(id, Components.Player);
        const enemy = isPlayer
          ? undefined
          : world.getComponent(id, Components.Enemy);
        const enemyDef = enemy !== undefined
          ? ENEMY_DEFS[enemy.type]
          : ENEMY_DEFS[EnemyTypes.SIMPLE];

        const resolved = resolveState(velocity, climbing, shooting, attacking);
        if (anim.state !== resolved) {
          anim.state = resolved;
          anim.frame = 0;
          anim.timer = 0;
          if (isPlayer) {
            const def = PLAYER_ANIM_DEFS[resolved];
            sprite.sheet = def.sheet;
            sprite.cols = def.cols > 0 ? def.cols : def.frames;
            sprite.rows = def.rows;
          } else {
            bindEnemySheet(sprite, enemyDef, resolved);
          }
        }

        const def = isPlayer
          ? PLAYER_ANIM_DEFS[anim.state]
          : bindEnemySheet(sprite, enemyDef, anim.state);

        if (anim.state === AnimStates.SHOOT) {
          anim.frame = SHOOT_POSES[facing.dir];
          sprite.flipX = false;
          continue;
        }

        sprite.flipX = facing.dir === FacingDirs.LEFT;

        if (anim.state === AnimStates.CLIMB && velocity.y === 0) {
          continue;
        }

        advance(anim, def, dt);
      }
    },
  };
}
