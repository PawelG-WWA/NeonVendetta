import {
  Components,
  ClimbingModes,
  FacingDirs,
  AnimStates,
  Teams,
  createPosition,
  createVelocity,
  createBody,
  createGravity,
  createGrounded,
  createClimbing,
  createInsideBuilding,
  createBoundsConstrained,
  createTeam,
  createHealth,
  createFacing,
  createAnimState,
  createSprite,
  createRenderable,
  createProjectile,
  createLifetime,
  createEnemy as createEnemyComponent,
  createEnemyAI,
  createAttacking,
} from './components.js';
import { zoneContextOf } from '../world/zone.js';

const ENEMY_SPRITE_Z = 5;

// Enemy types — Phase 7. All sheets face RIGHT (animationSystem flips for
// left). Every sheet of a type shares that type's frame dims; grids differ:
// move 16f 4x4, attack 8f 4x2, climb 8f 4x2; death is 8f 4x2 for simple/tough
// but 10f 5x2 for medium (enemy2_death.png is 200x112).
export const EnemyTypes = Object.freeze({
  SIMPLE: 'enemy',
  MEDIUM: 'enemy2',
  TOUGH: 'enemy3',
});

export const ENEMY_DEFS = Object.freeze({
  [EnemyTypes.SIMPLE]: Object.freeze({
    health: 1,
    speed: 60,
    scoreValue: 100,
    bodyWidth: 24,
    bodyHeight: 40,
    frameWidth: 32,
    frameHeight: 48,
    sheets: Object.freeze({
      move: 'assets/enemy_move.png',
      attack: 'assets/enemy_attack.png',
      climb: 'assets/enemy_climb.png',
      death: 'assets/enemy_death.png',
    }),
    moveCols: 4,
    moveRows: 4,
    attackCols: 4,
    attackRows: 2,
    climbCols: 4,
    climbRows: 2,
    deathCols: 4,
    deathRows: 2,
  }),
  [EnemyTypes.MEDIUM]: Object.freeze({
    health: 3,
    speed: 45,
    scoreValue: 250,
    bodyWidth: 30,
    bodyHeight: 48,
    frameWidth: 40,
    frameHeight: 56,
    sheets: Object.freeze({
      move: 'assets/enemy2_move.png',
      attack: 'assets/enemy2_attack.png',
      climb: 'assets/enemy2_climb.png',
      death: 'assets/enemy2_death.png',
    }),
    moveCols: 4,
    moveRows: 4,
    attackCols: 4,
    attackRows: 2,
    climbCols: 4,
    climbRows: 2,
    deathCols: 5,
    deathRows: 2,
  }),
  [EnemyTypes.TOUGH]: Object.freeze({
    health: 5,
    speed: 30,
    scoreValue: 500,
    bodyWidth: 36,
    bodyHeight: 56,
    frameWidth: 48,
    frameHeight: 64,
    sheets: Object.freeze({
      move: 'assets/enemy3_move.png',
      attack: 'assets/enemy3_attack.png',
      climb: 'assets/enemy3_climb.png',
      death: 'assets/enemy3_death.png',
    }),
    moveCols: 4,
    moveRows: 4,
    attackCols: 4,
    attackRows: 2,
    climbCols: 4,
    climbRows: 2,
    deathCols: 4,
    deathRows: 2,
  }),
});

const BULLET_WIDTH = 16;
const BULLET_HEIGHT = 4;
const BULLET_SPRITE_Z = 6;
const BULLET_SHEET = 'assets/bullet.png';
const BULLET_SPEED = 480;
const BULLET_DAMAGE = 1;

// Window masking (req 8) for shot effects: an effect created in an indoor
// context (shooter/impact inside a building) renders at INDOOR_EFFECT_Z —
// above indoor sprites (z=3) but BEHIND the facade mask (z=4), so it shows
// through the window/ladder holes instead of floating over the building.
const INDOOR_EFFECT_Z = 3.5;

function effectZFor(context, outdoorZ) {
  return context !== null && context !== undefined && context.buildingId !== null
    ? INDOOR_EFFECT_Z
    : outdoorZ;
}

export const MUZZLE_FLASH_SIZE = 24;
const MUZZLE_FLASH_SHEET = 'assets/muzzle_flash.png';
const MUZZLE_FLASH_COLS = 4;
const MUZZLE_FLASH_ROWS = 1;
const MUZZLE_FLASH_Z = 7;
const MUZZLE_FLASH_DURATION = 0.08;

export const HIT_SPARK_SIZE = 24;
const HIT_SPARK_SHEET = 'assets/hit_spark.png';
const HIT_SPARK_COLS = 5;
const HIT_SPARK_ROWS = 1;
const HIT_SPARK_Z = 7;
const HIT_SPARK_DURATION = 0.12;

// createEnemy — Phase 7 generic enemy factory. Composes the full mobile-enemy
// component set from ENEMY_DEFS[type]: physics body, zone context, AI state,
// attack intent, and the move-sheet sprite. spawnSystem owns spawn placement
// (including stripping BoundsConstrained for off-screen walk-ins).
export function createEnemy(world, type, x, y) {
  const def = ENEMY_DEFS[type];
  const id = world.createEntity();
  world.addComponent(id, Components.Position, createPosition(x, y));
  world.addComponent(id, Components.Velocity, createVelocity(0, 0));
  world.addComponent(id, Components.Body, createBody(def.bodyWidth, def.bodyHeight));
  world.addComponent(id, Components.Gravity, createGravity(1));
  world.addComponent(id, Components.Grounded, createGrounded(false, null));
  world.addComponent(id, Components.Climbing, createClimbing(ClimbingModes.NONE));
  world.addComponent(id, Components.InsideBuilding, createInsideBuilding(null, 0));
  world.addComponent(id, Components.BoundsConstrained, createBoundsConstrained());
  world.addComponent(id, Components.Team, createTeam(Teams.ENEMY));
  world.addComponent(id, Components.Health, createHealth(def.health));
  world.addComponent(
    id,
    Components.Enemy,
    createEnemyComponent({ type, speed: def.speed, scoreValue: def.scoreValue })
  );
  world.addComponent(id, Components.EnemyAI, createEnemyAI());
  world.addComponent(id, Components.Attacking, createAttacking(false));
  world.addComponent(id, Components.Facing, createFacing(FacingDirs.LEFT));
  world.addComponent(id, Components.AnimState, createAnimState(AnimStates.RUN));
  world.addComponent(
    id,
    Components.Sprite,
    createSprite({
      sheet: def.sheets.move,
      frameW: def.frameWidth,
      frameH: def.frameHeight,
      cols: def.moveCols,
      rows: def.moveRows,
      flipX: true,
    })
  );
  world.addComponent(
    id,
    Components.Renderable,
    createRenderable({
      texturePath: def.sheets.move,
      width: def.frameWidth,
      height: def.frameHeight,
      z: ENEMY_SPRITE_Z,
      visible: true,
    })
  );
  return id;
}

export function createSimpleEnemy(world, x, y) {
  return createEnemy(world, EnemyTypes.SIMPLE, x, y);
}

export function createMediumEnemy(world, x, y) {
  return createEnemy(world, EnemyTypes.MEDIUM, x, y);
}

export function createToughEnemy(world, x, y) {
  return createEnemy(world, EnemyTypes.TOUGH, x, y);
}

// createBullet — Phase 5 projectile framework stub (real firing arrives with
// weapons in Phase 6). The shooter's zone context is frozen onto the
// projectile so it only interacts with entities in that zone.
export function createBullet(world, x, y, dx, dy, shooterInside) {
  const id = world.createEntity();
  world.addComponent(id, Components.Projectile, createProjectile({
    dx,
    dy,
    speed: BULLET_SPEED,
    damage: BULLET_DAMAGE,
    context: zoneContextOf(shooterInside),
  }));
  world.addComponent(id, Components.Position, createPosition(x, y));
  world.addComponent(id, Components.Velocity, createVelocity(0, 0));
  world.addComponent(id, Components.Body, createBody(BULLET_WIDTH, BULLET_HEIGHT));
  world.addComponent(
    id,
    Components.Renderable,
    createRenderable({
      texturePath: BULLET_SHEET,
      width: BULLET_WIDTH,
      height: BULLET_HEIGHT,
      z: effectZFor(shooterInside, BULLET_SPRITE_Z),
      visible: true,
    })
  );
  return id;
}

// createMuzzleFlash — Phase 6 ephemeral shot feedback. x/y is the muzzle
// point; the 24x24 quad is centered on it. No Position component: the flash
// never moves, so renderSystem keeps the static renderable x/y anchoring.
// lifetimeSystem animates the 4-frame sheet over MUZZLE_FLASH_DURATION and
// destroys the entity. shooterInside (optional) freezes the shooter's zone
// context onto the flash z (indoor shots render behind the facade mask).
export function createMuzzleFlash(world, x, y, shooterInside) {
  const id = world.createEntity();
  world.addComponent(
    id,
    Components.Renderable,
    createRenderable({
      texturePath: MUZZLE_FLASH_SHEET,
      width: MUZZLE_FLASH_SIZE,
      height: MUZZLE_FLASH_SIZE,
      x: x - MUZZLE_FLASH_SIZE / 2,
      y: y - MUZZLE_FLASH_SIZE / 2,
      z: effectZFor(shooterInside, MUZZLE_FLASH_Z),
      visible: true,
    })
  );
  world.addComponent(
    id,
    Components.Sprite,
    createSprite({
      sheet: MUZZLE_FLASH_SHEET,
      frameW: MUZZLE_FLASH_SIZE,
      frameH: MUZZLE_FLASH_SIZE,
      cols: MUZZLE_FLASH_COLS,
      rows: MUZZLE_FLASH_ROWS,
    })
  );
  world.addComponent(id, Components.AnimState, createAnimState(AnimStates.IDLE));
  world.addComponent(id, Components.Lifetime, createLifetime(MUZZLE_FLASH_DURATION));
  return id;
}

// createHitSpark — bullet-impact feedback, spawned by damageSystem at the
// impact point. Same ephemeral shape as the muzzle flash: a static 24x24
// quad centered on x/y, the 5-frame sheet (5x1) played once over
// HIT_SPARK_DURATION by lifetimeSystem, then destroyed. context (optional)
// is the impacting projectile's frozen zone context — an indoor impact
// renders behind the facade mask.
export function createHitSpark(world, x, y, context) {
  const id = world.createEntity();
  world.addComponent(
    id,
    Components.Renderable,
    createRenderable({
      texturePath: HIT_SPARK_SHEET,
      width: HIT_SPARK_SIZE,
      height: HIT_SPARK_SIZE,
      x: x - HIT_SPARK_SIZE / 2,
      y: y - HIT_SPARK_SIZE / 2,
      z: effectZFor(context, HIT_SPARK_Z),
      visible: true,
    })
  );
  world.addComponent(
    id,
    Components.Sprite,
    createSprite({
      sheet: HIT_SPARK_SHEET,
      frameW: HIT_SPARK_SIZE,
      frameH: HIT_SPARK_SIZE,
      cols: HIT_SPARK_COLS,
      rows: HIT_SPARK_ROWS,
    })
  );
  world.addComponent(id, Components.AnimState, createAnimState(AnimStates.IDLE));
  world.addComponent(id, Components.Lifetime, createLifetime(HIT_SPARK_DURATION));
  return id;
}
