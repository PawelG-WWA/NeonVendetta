import { createWorld } from '../js/ecs/world.js';
import {
  Components,
  GameStates,
  ClimbingModes,
  BuildingIds,
  FacingDirs,
  AnimStates,
  EnemyAIStates,
  Teams,
  createGameState,
  createBestScore,
  createScore,
  createKillStats,
  createInputState,
  createPosition,
  createVelocity,
  createBody,
  createGravity,
  createGrounded,
  createClimbing,
  createInsideBuilding,
  createTeam,
  createPlayer,
  createDead,
} from '../js/ecs/components.js';
import {
  ENEMY_DEFS,
  EnemyTypes,
  createSimpleEnemy,
  createMediumEnemy,
  createToughEnemy,
  createBullet,
  createMuzzleFlash,
} from '../js/ecs/factories.js';
import { createGameStateSystem } from '../js/ecs/systems/gameStateSystem.js';
import { createPlayerSpawnSystem } from '../js/ecs/systems/playerSpawnSystem.js';
import {
  createSpawnSystem,
  computeWaveBudget,
  composeWave,
  PRACTICE_END_KILLS,
  MAX_ACTIVE_ENEMIES,
  VANISH_MARGIN,
} from '../js/ecs/systems/spawnSystem.js';
import { createEnemyAISystem } from '../js/ecs/systems/enemyAISystem.js';
import { createPhysicsSystem } from '../js/ecs/systems/physicsSystem.js';
import { createClimbSystem } from '../js/ecs/systems/climbSystem.js';
import { createBoundsSystem } from '../js/ecs/systems/boundsSystem.js';
import { createCollisionSystem } from '../js/ecs/systems/collisionSystem.js';
import { createDamageSystem } from '../js/ecs/systems/damageSystem.js';
import { createDeathAnimSystem } from '../js/ecs/systems/deathAnimSystem.js';
import { createAnimationSystem } from '../js/ecs/systems/animationSystem.js';
import { createHudSystem } from '../js/ecs/systems/hudSystem.js';
import { LAYOUT, GAME_WIDTH } from '../js/world/layout.js';
import { OUTDOOR_FLOOR_ID } from '../js/world/floors.js';

const DT = 1 / 60;
const GROUND_Y = LAYOUT.groundY;

let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    passed++;
    console.log('ok - ' + message);
  } else {
    failed++;
    console.error('FAIL - ' + message);
  }
}

function makeGameEntity(world, state = GameStates.PLAYING) {
  const gameEntity = world.createEntity();
  world.addComponent(gameEntity, Components.GameState, createGameState(state));
  world.addComponent(gameEntity, Components.Score, createScore(0));
  world.addComponent(gameEntity, Components.KillStats, createKillStats(0));
  world.addComponent(gameEntity, Components.BestScore, createBestScore(0));
  return gameEntity;
}

// Spawn-only rig: no AI, so spawned enemies stay exactly where they were
// placed (spawn placement is what these tests assert).
function makeSpawnRig({ random, state = GameStates.PLAYING } = {}) {
  const world = createWorld();
  const gameEntity = makeGameEntity(world, state);
  const inputEntity = world.createEntity();
  world.addComponent(inputEntity, Components.InputState, createInputState());

  const gameStateSystem = createGameStateSystem(world);
  const spawnSystem = createSpawnSystem(world, random !== undefined ? { random } : {});
  const physicsSystem = createPhysicsSystem(world);
  const climbSystem = createClimbSystem(world);
  const boundsSystem = createBoundsSystem(world);

  function step(count = 1) {
    for (let i = 0; i < count; i++) {
      gameStateSystem.update(DT);
      spawnSystem.update(DT);
      physicsSystem.update(DT);
      climbSystem.update(DT);
      boundsSystem.update(DT);
    }
  }

  return { world, gameEntity, spawnSystem, step };
}

// AI rig: behavior systems only — no spawner, no collision/damage.
function makeAIRig({ random } = {}) {
  const world = createWorld();
  const gameEntity = makeGameEntity(world);

  const enemyAISystem = createEnemyAISystem(world, random !== undefined ? { random } : {});
  const physicsSystem = createPhysicsSystem(world);
  const climbSystem = createClimbSystem(world);
  const boundsSystem = createBoundsSystem(world);
  const animationSystem = createAnimationSystem(world);

  function step(count = 1) {
    for (let i = 0; i < count; i++) {
      enemyAISystem.update(DT);
      physicsSystem.update(DT);
      climbSystem.update(DT);
      boundsSystem.update(DT);
      animationSystem.update(DT);
    }
  }

  return { world, gameEntity, step };
}

// Full rig: spawner + AI + physics + collision + damage.
function makeFullRig({ random } = {}) {
  const world = createWorld();
  const gameEntity = makeGameEntity(world);
  const inputEntity = world.createEntity();
  world.addComponent(inputEntity, Components.InputState, createInputState());

  const gameStateSystem = createGameStateSystem(world);
  const spawnSystem = createSpawnSystem(world, random !== undefined ? { random } : {});
  const enemyAISystem = createEnemyAISystem(world, random !== undefined ? { random } : {});
  const physicsSystem = createPhysicsSystem(world);
  const climbSystem = createClimbSystem(world);
  const boundsSystem = createBoundsSystem(world);
  const collisionSystem = createCollisionSystem(world);
  const deathAnimSystem = createDeathAnimSystem(world);
  const damageSystem = createDamageSystem(world, collisionSystem);
  const animationSystem = createAnimationSystem(world);

  function step(count = 1) {
    for (let i = 0; i < count; i++) {
      gameStateSystem.update(DT);
      spawnSystem.update(DT);
      enemyAISystem.update(DT);
      physicsSystem.update(DT);
      climbSystem.update(DT);
      boundsSystem.update(DT);
      collisionSystem.update(DT);
      deathAnimSystem.update(DT);
      damageSystem.update(DT);
      animationSystem.update(DT);
    }
  }

  return { world, gameEntity, step };
}

function makeDamageRig() {
  const world = createWorld();
  const gameEntity = makeGameEntity(world);
  const collisionSystem = createCollisionSystem(world);
  const deathAnimSystem = createDeathAnimSystem(world);
  const damageSystem = createDamageSystem(world, collisionSystem);

  function step(count = 1) {
    for (let i = 0; i < count; i++) {
      collisionSystem.update(DT);
      deathAnimSystem.update(DT);
      damageSystem.update(DT);
    }
  }

  return { world, gameEntity, step };
}

function addAIPlayer(rig, { x, y = GROUND_Y, buildingId = null, floor = 0 }) {
  const world = rig.world;
  const id = world.createEntity();
  world.addComponent(id, Components.Player, createPlayer());
  world.addComponent(id, Components.Position, createPosition(x, y));
  world.addComponent(id, Components.Body, createBody(24, 40));
  world.addComponent(id, Components.InsideBuilding, createInsideBuilding(buildingId, floor));
  return id;
}

function placeIndoors(rig, id, buildingId, floor, x) {
  const position = rig.world.getComponent(id, Components.Position);
  const inside = rig.world.getComponent(id, Components.InsideBuilding);
  position.x = x;
  position.y = LAYOUT.buildings[buildingId].floors[floor].y;
  inside.buildingId = buildingId;
  inside.floor = floor;
}

function enemyIds(world) {
  return world.query(Components.Enemy);
}

function testFactories() {
  const world = createWorld();

  const simpleId = createSimpleEnemy(world, 100, GROUND_Y);
  const simpleDef = ENEMY_DEFS[EnemyTypes.SIMPLE];
  let health = world.getComponent(simpleId, Components.Health);
  let enemy = world.getComponent(simpleId, Components.Enemy);
  let sprite = world.getComponent(simpleId, Components.Sprite);
  let body = world.getComponent(simpleId, Components.Body);
  check(health.hp === 1 && health.maxHp === 1, 'factory: simple health 1');
  check(
    enemy.type === 'enemy' && enemy.speed === 60 && enemy.scoreValue === 100,
    'factory: simple speed 60, score 100'
  );
  check(
    sprite.sheet === 'assets/enemy_move.png' &&
      sprite.frameW === 32 && sprite.frameH === 48 &&
      sprite.cols === 4 && sprite.rows === 4,
    'factory: simple move sheet 32x48 4x4'
  );
  check(body.width === 24 && body.height === 40, 'factory: simple body 24x40');
  check(
    simpleDef.sheets.attack === 'assets/enemy_attack.png' &&
      simpleDef.sheets.climb === 'assets/enemy_climb.png' &&
      simpleDef.sheets.death === 'assets/enemy_death.png',
    'factory: simple attack/climb/death sheets bound'
  );
  check(
    world.hasComponent(simpleId, Components.EnemyAI) &&
      world.getComponent(simpleId, Components.EnemyAI).state === EnemyAIStates.SEEK &&
      world.hasComponent(simpleId, Components.Attacking),
    'factory: simple carries EnemyAI (seek) + Attacking'
  );

  const mediumId = createMediumEnemy(world, 100, GROUND_Y);
  health = world.getComponent(mediumId, Components.Health);
  enemy = world.getComponent(mediumId, Components.Enemy);
  sprite = world.getComponent(mediumId, Components.Sprite);
  body = world.getComponent(mediumId, Components.Body);
  check(health.hp === 3 && health.maxHp === 3, 'factory: medium health 3');
  check(
    enemy.type === 'enemy2' && enemy.speed === 45 && enemy.scoreValue === 250,
    'factory: medium speed 45, score 250'
  );
  check(
    sprite.sheet === 'assets/enemy2_move.png' &&
      sprite.frameW === 40 && sprite.frameH === 56 &&
      sprite.cols === 4 && sprite.rows === 4,
    'factory: medium move sheet 40x56 4x4'
  );
  check(body.width === 30 && body.height === 48, 'factory: medium body 30x48');

  const toughId = createToughEnemy(world, 100, GROUND_Y);
  health = world.getComponent(toughId, Components.Health);
  enemy = world.getComponent(toughId, Components.Enemy);
  sprite = world.getComponent(toughId, Components.Sprite);
  body = world.getComponent(toughId, Components.Body);
  check(health.hp === 5 && health.maxHp === 5, 'factory: tough health 5');
  check(
    enemy.type === 'enemy3' && enemy.speed === 30 && enemy.scoreValue === 500,
    'factory: tough speed 30, score 500'
  );
  check(
    sprite.sheet === 'assets/enemy3_move.png' &&
      sprite.frameW === 48 && sprite.frameH === 64 &&
      sprite.cols === 4 && sprite.rows === 4,
    'factory: tough move sheet 48x64 4x4'
  );
  check(body.width === 36 && body.height === 56, 'factory: tough body 36x56');
}

function killWithBullets(rig, enemyId, shots) {
  const world = rig.world;
  const inside = world.getComponent(enemyId, Components.InsideBuilding);
  const position = world.getComponent(enemyId, Components.Position);
  for (let i = 0; i < shots; i++) {
    createBullet(world, position.x - 16, position.y + 20, 1, 0, inside);
    rig.step(1);
  }
}

function testDamageScoreAndKills() {
  const rig = makeDamageRig();
  const world = rig.world;
  const score = world.getComponent(rig.gameEntity, Components.Score);
  const killStats = world.getComponent(rig.gameEntity, Components.KillStats);

  const simpleId = createSimpleEnemy(world, 400, GROUND_Y);
  killWithBullets(rig, simpleId, 1);
  check(score.value === 100, 'damage: simple kill awards 100');
  check(killStats.kills === 1, 'damage: simple kill increments KillStats');

  const mediumId = createMediumEnemy(world, 600, GROUND_Y);
  killWithBullets(rig, mediumId, 3);
  check(score.value === 350, 'damage: medium kill awards 250');
  check(killStats.kills === 2, 'damage: medium kill increments KillStats');
  const mediumSprite = world.getComponent(mediumId, Components.Sprite);
  check(
    mediumSprite.sheet === 'assets/enemy2_death.png' &&
      mediumSprite.cols === 5 && mediumSprite.rows === 2 &&
      mediumSprite.frameW === 40 && mediumSprite.frameH === 56,
    'damage: medium death sheet enemy2_death 5x2 40x56'
  );

  const toughId = createToughEnemy(world, 900, GROUND_Y);
  killWithBullets(rig, toughId, 5);
  check(score.value === 850, 'damage: tough kill awards 500');
  check(killStats.kills === 3, 'damage: tough kill increments KillStats');
  const toughSprite = world.getComponent(toughId, Components.Sprite);
  check(
    toughSprite.sheet === 'assets/enemy3_death.png' &&
      toughSprite.cols === 4 && toughSprite.rows === 2 &&
      toughSprite.frameW === 48 && toughSprite.frameH === 64,
    'damage: tough death sheet enemy3_death 4x2 48x64'
  );
}

function testEnemy2DeathAnimTenFrames() {
  const rig = makeDamageRig();
  const world = rig.world;

  const mediumId = createMediumEnemy(world, 400, GROUND_Y);
  killWithBullets(rig, mediumId, 3);
  check(world.hasComponent(mediumId, Components.Dead), 'death10: medium dying after 3 hits');
  const sprite = world.getComponent(mediumId, Components.Sprite);
  check(sprite.cols * sprite.rows === 10, 'death10: enemy2 death grid holds 10 frames');

  rig.step(25);
  const anim = world.getComponent(mediumId, Components.AnimState);
  check(anim.frame === 5, 'death10: 10 frames stretch over the duration (frame 5 at ~0.42s)');

  rig.step(21);
  check(anim.frame === 9, 'death10: final frame is 9 (10 frames total)');
  check(world.hasComponent(mediumId, Components.AnimState), 'death10: corpse alive until duration ends');

  rig.step(5);
  check(!world.hasComponent(mediumId, Components.AnimState), 'death10: corpse destroyed after 0.8s');
}

function testPracticePeriod() {
  const rig = makeSpawnRig();
  const world = rig.world;
  const killStats = world.getComponent(rig.gameEntity, Components.KillStats);

  rig.step(1);
  check(enemyIds(world).length === 1, 'practice: first simple spawns immediately');

  rig.step(90);
  check(enemyIds(world).length === 2, 'practice: second simple ~1.5s later (not kill-gated)');

  rig.step(90);
  check(enemyIds(world).length === 3, 'practice: third simple at ~3s');

  rig.step(180);
  check(enemyIds(world).length === 5, 'practice: five sequential simples by ~6s');
  check(
    enemyIds(world).every((id) => world.getComponent(id, Components.Enemy).type === EnemyTypes.SIMPLE),
    'practice: all practice enemies are simple'
  );

  killStats.kills = 5;
  rig.step(90);
  check(enemyIds(world).length === 7, 'practice: after 5 kills simples spawn in pairs');
}

function testSpawnDirectorSilentOutsidePlaying() {
  const menuRig = makeSpawnRig({ state: GameStates.MENU });
  menuRig.step(600);
  check(enemyIds(menuRig.world).length === 0, 'director: no spawns while in MENU');

  const gameOverRig = makeSpawnRig({ state: GameStates.GAME_OVER });
  gameOverRig.step(600);
  check(enemyIds(gameOverRig.world).length === 0, 'director: no spawns while in GAME_OVER');
}

function testWaveBudgetMath() {
  check(computeWaveBudget(10) === 3, 'budget: 3 at 10 kills');
  check(computeWaveBudget(14) === 4, 'budget: 4 at 14 kills');
  check(computeWaveBudget(22) === 6, 'budget: 6 at 22 kills');
  check(computeWaveBudget(46) === 12, 'budget: capped at 12 (46 kills)');
  check(computeWaveBudget(100) === 12, 'budget: cap holds at 100 kills');
}

function waveCost(wave) {
  const costs = { [EnemyTypes.SIMPLE]: 1, [EnemyTypes.MEDIUM]: 3, [EnemyTypes.TOUGH]: 5 };
  let total = 0;
  for (let i = 0; i < wave.length; i++) {
    total += costs[wave[i]];
  }
  return total;
}

function countType(wave, type) {
  let total = 0;
  for (let i = 0; i < wave.length; i++) {
    if (wave[i] === type) {
      total += 1;
    }
  }
  return total;
}

function testWaveComposition() {
  let wave = composeWave(12, 10, 0, 10);
  check(waveCost(wave) === 12, 'wave: budget 12 fully spent');
  check(
    countType(wave, EnemyTypes.TOUGH) === 1,
    'wave: budget >= 8 includes a tough (within the 30% cap of 10 actives)'
  );
  check(
    countType(wave, EnemyTypes.MEDIUM) * 2 <= wave.length,
    'wave: mediums at most 50% of composition'
  );

  wave = composeWave(3, 0, 0, 10);
  check(waveCost(wave) === 3, 'wave: budget 3 fully spent');
  check(
    countType(wave, EnemyTypes.MEDIUM) === 0,
    'wave: budget 3 stays simples-only (a solo medium would be 100% of the wave)'
  );
  check(
    countType(wave, EnemyTypes.MEDIUM) * 2 <= wave.length,
    'wave: budget 3 final wave satisfies the 50% medium rule'
  );

  wave = composeWave(5, 0, 0, 10);
  check(
    countType(wave, EnemyTypes.MEDIUM) + countType(wave, EnemyTypes.TOUGH) >= 1,
    'wave: budget >= 5 includes at least one medium or tough'
  );
  check(waveCost(wave) === 5, 'wave: budget 5 fully spent');

  wave = composeWave(7, 0, 0, 10);
  check(waveCost(wave) === 7, 'wave: budget 7 fully spent');
  check(
    countType(wave, EnemyTypes.MEDIUM) >= 1,
    'wave: budget 7 keeps the mixed-wave medium'
  );
  check(
    countType(wave, EnemyTypes.MEDIUM) * 2 <= wave.length,
    'wave: budget 7 final wave satisfies the 50% medium rule'
  );

  wave = composeWave(12, 9, 2, 5);
  check(
    countType(wave, EnemyTypes.TOUGH) === 0,
    'wave: tough cap enforced (9 actives, 2 already tough -> none more)'
  );

  wave = composeWave(12, 10, 3, 10);
  check(
    countType(wave, EnemyTypes.TOUGH) === 0,
    'wave: tough cap enforced (10 actives already 30% tough)'
  );

  wave = composeWave(12, 0, 0, 2);
  check(wave.length <= 2, 'wave: never exceeds slot headroom (active cap)');
}

function testBudgetWaveIntegration() {
  const rig = makeSpawnRig();
  const world = rig.world;
  const killStats = world.getComponent(rig.gameEntity, Components.KillStats);
  killStats.kills = PRACTICE_END_KILLS;

  rig.step(241);
  let ids = enemyIds(world);
  check(ids.length === 3, 'wave: budget 3 at 10 kills spawns three enemies');
  check(
    ids.every((id) => world.getComponent(id, Components.Enemy).type === EnemyTypes.SIMPLE),
    'wave: budget 3 buys simples only (a lone medium would break the 50% rule)'
  );

  for (let i = 0; i < ids.length; i++) {
    world.destroyEntity(ids[i]);
  }
  killStats.kills = 22;
  rig.step(241);
  ids = enemyIds(world);
  check(ids.length === 4, 'wave: budget 6 at 22 kills spawns four enemies');
  check(
    countType(ids.map((id) => world.getComponent(id, Components.Enemy).type), EnemyTypes.MEDIUM) === 1 &&
      countType(ids.map((id) => world.getComponent(id, Components.Enemy).type), EnemyTypes.SIMPLE) === 3,
    'wave: budget 6 mixes one medium with three simples'
  );

  for (let i = 0; i < ids.length; i++) {
    world.destroyEntity(ids[i]);
  }
  killStats.kills = 26;
  rig.step(241);
  ids = enemyIds(world);
  check(ids.length === 5, 'wave: budget 7 at 26 kills spawns five enemies');
  check(
    countType(ids.map((id) => world.getComponent(id, Components.Enemy).type), EnemyTypes.MEDIUM) === 1 &&
      countType(ids.map((id) => world.getComponent(id, Components.Enemy).type), EnemyTypes.SIMPLE) === 4,
    'wave: budget 7 mixes one medium with four simples'
  );
}

function testActiveCapEnforced() {
  const rig = makeSpawnRig();
  const world = rig.world;
  const killStats = world.getComponent(rig.gameEntity, Components.KillStats);
  killStats.kills = 22;

  for (let i = 0; i < MAX_ACTIVE_ENEMIES; i++) {
    createSimpleEnemy(world, 100 + i * 50, GROUND_Y);
  }
  rig.step(241);
  check(enemyIds(world).length === MAX_ACTIVE_ENEMIES, 'cap: no wave spawns past 10 active enemies');
}

function testNoSpawnOnPlayerFloor() {
  const indexRolls = [0.5 / 7, 1.5 / 7, 2.5 / 7, 3.5 / 7, 4.5 / 7, 5.5 / 7, 6.5 / 7];
  const script = [];
  for (let i = 0; i < indexRolls.length; i++) {
    script.push(0.1, indexRolls[i], 0.5);
  }
  let cursor = 0;
  const rig = makeSpawnRig({
    random: () => {
      const value = script[cursor % script.length];
      cursor += 1;
      return value;
    },
  });
  const world = rig.world;
  const playerId = addAIPlayer(rig, { x: 400 });
  placeIndoors(rig, playerId, BuildingIds.LEFT, 1, 400);

  rig.step(541);
  const ids = enemyIds(world);
  check(ids.length === 7, 'fairness: seven practice enemies spawned');
  check(
    !ids.some((id) => {
      const inside = world.getComponent(id, Components.InsideBuilding);
      return inside.buildingId === BuildingIds.LEFT && inside.floor === 1;
    }),
    'fairness: no enemy spawned on the player building+floor'
  );
  check(
    ids.some((id) => {
      const inside = world.getComponent(id, Components.InsideBuilding);
      return inside.buildingId === BuildingIds.LEFT && inside.floor === 0;
    }) &&
      ids.some((id) => {
        const inside = world.getComponent(id, Components.InsideBuilding);
        return inside.buildingId === BuildingIds.LEFT && inside.floor === 2;
      }) &&
      ids.some((id) => world.getComponent(id, Components.InsideBuilding).buildingId === BuildingIds.RIGHT),
    'fairness: other floors and buildings still receive indoor spawns'
  );
}

function testIndoorSpawnKeepsBounds() {
  const script = [0.1, 0.3, 0.5];
  let cursor = 0;
  const rig = makeSpawnRig({
    random: () => {
      const value = script[cursor % script.length];
      cursor += 1;
      return value;
    },
  });
  const world = rig.world;

  rig.step(1);
  const ids = enemyIds(world);
  check(ids.length === 1, 'indoor: one practice enemy spawned');
  check(
    world.getComponent(ids[0], Components.InsideBuilding).buildingId !== null,
    'indoor: scripted roll places the spawn inside a building'
  );
  check(
    world.hasComponent(ids[0], Components.BoundsConstrained),
    'indoor: indoor spawns retain BoundsConstrained'
  );
}

function testOutdoorSeek() {
  const rig = makeAIRig();
  const world = rig.world;
  addAIPlayer(rig, { x: 800 });
  const enemyId = createSimpleEnemy(world, 400, GROUND_Y);

  rig.step(1);
  let velocity = world.getComponent(enemyId, Components.Velocity);
  let facing = world.getComponent(enemyId, Components.Facing);
  let ai = world.getComponent(enemyId, Components.EnemyAI);
  check(velocity.x === 60, 'ai: outdoor enemy walks toward player x (+60)');
  check(facing.dir === FacingDirs.RIGHT, 'ai: seek faces right');
  check(ai.state === EnemyAIStates.SEEK, 'ai: state seek while approaching');

  const position = world.getComponent(enemyId, Components.Position);
  position.x = 1000;
  rig.step(1);
  check(velocity.x === -60, 'ai: seek walks left when player is left (-60)');
  check(facing.dir === FacingDirs.LEFT, 'ai: seek faces left');
}

function testAttackStateNearPlayer() {
  const rig = makeAIRig();
  const world = rig.world;
  const playerId = addAIPlayer(rig, { x: 800 });
  const enemyId = createSimpleEnemy(world, 812, GROUND_Y);

  rig.step(1);
  const velocity = world.getComponent(enemyId, Components.Velocity);
  const attacking = world.getComponent(enemyId, Components.Attacking);
  const ai = world.getComponent(enemyId, Components.EnemyAI);
  const anim = world.getComponent(enemyId, Components.AnimState);
  const sprite = world.getComponent(enemyId, Components.Sprite);
  check(ai.state === EnemyAIStates.ATTACK, 'ai: adjacent enemy enters attack state');
  check(attacking.active === true, 'ai: Attacking raised adjacent to the player');
  check(velocity.x === 0, 'ai: attack stops horizontal movement');
  check(
    anim.state === AnimStates.ATTACK &&
      sprite.sheet === 'assets/enemy_attack.png' &&
      sprite.cols === 4 && sprite.rows === 2,
    'ai: attack plays enemy_attack sheet (8f 4x2)'
  );
  check(sprite.flipX === true, 'ai: attack faces the player (left -> flipped)');

  const playerPosition = world.getComponent(playerId, Components.Position);
  playerPosition.x = 400;
  rig.step(1);
  check(attacking.active === false, 'ai: attack ends when the player is no longer adjacent');
  check(sprite.sheet === 'assets/enemy_move.png', 'ai: move sheet re-bound after attack');
}

function testLadderEngageClimbDismount() {
  const rig = makeAIRig();
  const world = rig.world;
  const rightFloors = LAYOUT.buildings.right.floors;
  const playerId = addAIPlayer(rig, { x: 900 });
  placeIndoors(rig, playerId, BuildingIds.RIGHT, 2, 900);
  const enemyId = createSimpleEnemy(world, 1040, GROUND_Y);

  rig.step(1);
  let climbing = world.getComponent(enemyId, Components.Climbing);
  let velocity = world.getComponent(enemyId, Components.Velocity);
  let ai = world.getComponent(enemyId, Components.EnemyAI);
  check(climbing.mode === ClimbingModes.LADDER, 'ai: enemy at ladder base engages climb (player inside right)');
  check(velocity.y === 80 && velocity.x === 0, 'ai: climb velocity upward');
  check(ai.state === EnemyAIStates.CLIMB, 'ai: state climb');

  rig.step(40);
  const anim = world.getComponent(enemyId, Components.AnimState);
  const sprite = world.getComponent(enemyId, Components.Sprite);
  const inside = world.getComponent(enemyId, Components.InsideBuilding);
  check(
    anim.state === AnimStates.CLIMB && sprite.sheet === 'assets/enemy_climb.png',
    'ai: climb sheet plays while climbing'
  );
  check(inside.buildingId === BuildingIds.RIGHT, 'ai: climbing assigns right building');

  rig.step(170);
  climbing = world.getComponent(enemyId, Components.Climbing);
  velocity = world.getComponent(enemyId, Components.Velocity);
  ai = world.getComponent(enemyId, Components.EnemyAI);
  check(climbing.mode === ClimbingModes.NONE, 'ai: dismounts at the player floor');
  check(inside.floor === 2, 'ai: dismount lands on player floor 2');
  check(ai.state === EnemyAIStates.SEEK && velocity.x === -60, 'ai: seeks the player after dismount');
}

function testStairsEngageTowardPlayerFloor() {
  const rig = makeAIRig();
  const world = rig.world;
  const leftFloors = LAYOUT.buildings.left.floors;
  const playerId = addAIPlayer(rig, { x: 300 });
  placeIndoors(rig, playerId, BuildingIds.LEFT, 2, 300);
  const enemyId = createSimpleEnemy(world, 600, leftFloors[0].y);
  placeIndoors(rig, enemyId, BuildingIds.LEFT, 0, 600);

  rig.step(1);
  let climbing = world.getComponent(enemyId, Components.Climbing);
  let velocity = world.getComponent(enemyId, Components.Velocity);
  let ai = world.getComponent(enemyId, Components.EnemyAI);
  check(climbing.mode === ClimbingModes.STAIRS, 'ai: enemy inside left building uses stairs toward player floor');
  check(velocity.y === 80, 'ai: stairs climb velocity upward');
  check(ai.state === EnemyAIStates.CLIMB, 'ai: state climb on stairs');

  rig.step(200);
  climbing = world.getComponent(enemyId, Components.Climbing);
  const inside = world.getComponent(enemyId, Components.InsideBuilding);
  velocity = world.getComponent(enemyId, Components.Velocity);
  check(climbing.mode === ClimbingModes.NONE, 'ai: dismounts from stairs at player floor');
  check(inside.floor === 2, 'ai: stairs dismount lands on floor 2');
  check(velocity.x === -60, 'ai: seeks the player after stairs dismount');
}

function testDoorwayEntryRouting() {
  const rig = makeAIRig();
  const world = rig.world;
  const playerId = addAIPlayer(rig, { x: 300 });
  placeIndoors(rig, playerId, BuildingIds.LEFT, 0, 300);
  const enemyId = createSimpleEnemy(world, 600, GROUND_Y);

  rig.step(1);
  let velocity = world.getComponent(enemyId, Components.Velocity);
  check(velocity.x === -60, 'ai: outdoor enemy walks toward the left doorway');

  const position = world.getComponent(enemyId, Components.Position);
  position.x = 400;
  rig.step(1);
  const inside = world.getComponent(enemyId, Components.InsideBuilding);
  check(
    inside.buildingId === BuildingIds.LEFT && inside.floor === 0,
    'ai: doorway up-intent enters the left building'
  );
  check(
    Math.abs(position.y - LAYOUT.buildings.left.floors[0].y) < 1e-9,
    'ai: stands on indoor floor 0 after entry'
  );
}

function testDoorwayExitRouting() {
  const rig = makeAIRig();
  const world = rig.world;
  addAIPlayer(rig, { x: 100 });
  const enemyId = createSimpleEnemy(world, 600, LAYOUT.buildings.left.floors[0].y);
  placeIndoors(rig, enemyId, BuildingIds.LEFT, 0, 600);

  rig.step(1);
  let velocity = world.getComponent(enemyId, Components.Velocity);
  check(velocity.x === -60, 'ai: indoor enemy walks to the doorway when the player is outdoors');

  const position = world.getComponent(enemyId, Components.Position);
  position.x = 400;
  rig.step(1);
  const inside = world.getComponent(enemyId, Components.InsideBuilding);
  check(inside.buildingId === null, 'ai: doorway down-intent exits the building');
  check(Math.abs(position.y - GROUND_Y) < 1e-9, 'ai: exits at ground level');
}

function testFleeDecision() {
  const giveUpRig = makeAIRig({ random: () => 0.1 });
  let world = giveUpRig.world;
  let playerId = addAIPlayer(giveUpRig, { x: 340 });
  placeIndoors(giveUpRig, playerId, BuildingIds.LEFT, 0, 340);
  let enemyId = createSimpleEnemy(world, 1200, GROUND_Y);

  giveUpRig.step(181);
  let ai = world.getComponent(enemyId, Components.EnemyAI);
  let velocity = world.getComponent(enemyId, Components.Velocity);
  check(ai.state === EnemyAIStates.FLEE, 'ai: give-up roll can switch an outdoor enemy to flee');
  check(
    !world.hasComponent(enemyId, Components.BoundsConstrained),
    'ai: fleeing enemy drops BoundsConstrained (may leave the scene)'
  );
  check(velocity.x === 60 && ai.fleeDir === 1, 'ai: flee walks toward the nearest scene edge');

  const stayRig = makeAIRig({ random: () => 0.9 });
  world = stayRig.world;
  playerId = addAIPlayer(stayRig, { x: 340 });
  placeIndoors(stayRig, playerId, BuildingIds.LEFT, 0, 340);
  enemyId = createSimpleEnemy(world, 1200, GROUND_Y);

  stayRig.step(181);
  ai = world.getComponent(enemyId, Components.EnemyAI);
  check(ai.state === EnemyAIStates.SEEK, 'ai: failed give-up roll keeps pursuing');
  check(
    world.hasComponent(enemyId, Components.BoundsConstrained),
    'ai: pursuing enemy stays bounds-constrained'
  );
}

function testSeekContactKillsPlayer() {
  const rig = makeFullRig({ random: () => 0.9 });
  const world = rig.world;
  const killStats = world.getComponent(rig.gameEntity, Components.KillStats);
  killStats.kills = PRACTICE_END_KILLS;

  const playerId = world.createEntity();
  world.addComponent(playerId, Components.Player, createPlayer());
  world.addComponent(playerId, Components.Position, createPosition(800, GROUND_Y));
  world.addComponent(playerId, Components.Velocity, createVelocity(-40, 0));
  world.addComponent(playerId, Components.Body, createBody(24, 40));
  world.addComponent(playerId, Components.Gravity, createGravity(1));
  world.addComponent(playerId, Components.Grounded, createGrounded(true, OUTDOOR_FLOOR_ID));
  world.addComponent(playerId, Components.Climbing, createClimbing(ClimbingModes.NONE));
  world.addComponent(playerId, Components.InsideBuilding, createInsideBuilding(null, 0));
  world.addComponent(playerId, Components.Team, createTeam(Teams.PLAYER));

  const enemyId = createSimpleEnemy(world, 700, GROUND_Y);

  rig.step(1);
  const ai = world.getComponent(enemyId, Components.EnemyAI);
  check(ai.state === EnemyAIStates.SEEK, 'integration: enemy seeks the player');
  check(
    world.getComponent(enemyId, Components.Velocity).x === 60,
    'integration: seek drives the enemy toward the player'
  );

  rig.step(80);
  check(
    world.hasComponent(playerId, Components.Dead),
    'integration: AI-driven contact is fatal to the player'
  );

  rig.step(90);
  check(
    world.getComponent(rig.gameEntity, Components.GameState).current === GameStates.GAME_OVER,
    'integration: the death anim ends the run (GAME_OVER)'
  );
}

function testStationaryPlayerFatalAllTypes() {
  const cases = [
    { name: 'simple', spawn: createSimpleEnemy },
    { name: 'medium', spawn: createMediumEnemy },
    { name: 'tough', spawn: createToughEnemy },
  ];
  for (const { name, spawn } of cases) {
    const rig = makeFullRig({ random: () => 0.9 });
    const world = rig.world;
    const killStats = world.getComponent(rig.gameEntity, Components.KillStats);
    killStats.kills = PRACTICE_END_KILLS;

    // Stationary player: full physics body, zero velocity, never any input.
    const playerId = world.createEntity();
    world.addComponent(playerId, Components.Player, createPlayer());
    world.addComponent(playerId, Components.Position, createPosition(800, GROUND_Y));
    world.addComponent(playerId, Components.Velocity, createVelocity(0, 0));
    world.addComponent(playerId, Components.Body, createBody(24, 40));
    world.addComponent(playerId, Components.Gravity, createGravity(1));
    world.addComponent(playerId, Components.Grounded, createGrounded(true, OUTDOOR_FLOOR_ID));
    world.addComponent(playerId, Components.Climbing, createClimbing(ClimbingModes.NONE));
    world.addComponent(playerId, Components.InsideBuilding, createInsideBuilding(null, 0));
    world.addComponent(playerId, Components.Team, createTeam(Teams.PLAYER));

    spawn(world, 700, GROUND_Y);

    let died = false;
    for (let i = 0; i < 900 && !died; i++) {
      rig.step(1);
      died = world.hasComponent(playerId, Components.Dead);
    }
    check(died, 'fatality: stationary player dies to ' + name + ' (AI walks into contact)');

    rig.step(90);
    check(
      world.getComponent(rig.gameEntity, Components.GameState).current === GameStates.GAME_OVER,
      'fatality: the ' + name + ' kill ends the run (GAME_OVER)'
    );
  }
}

function testIndoorSpawnWhilePlayerDead() {
  // The 1.2s corpse window: beginDeath stripped the player's InsideBuilding,
  // so the director must treat the corpse as "no exclusion" — not crash.
  const rig = makeSpawnRig({ random: () => 0.4 });
  const world = rig.world;
  const playerId = addAIPlayer(rig, { x: 400 });
  world.addComponent(playerId, Components.Dead, createDead(1.2));
  world.removeComponent(playerId, Components.InsideBuilding);

  rig.step(2);
  const ids = enemyIds(world);
  check(ids.length === 1, 'death-spawn: spawn director survives the player corpse window');
  check(
    world.getComponent(ids[0], Components.InsideBuilding).buildingId !== null,
    'death-spawn: forced indoor roll (<0.5) spawns inside with no exclusion'
  );
}

function testReplacementRespectsActiveCap() {
  const rig = makeSpawnRig();
  const world = rig.world;
  const killStats = world.getComponent(rig.gameEntity, Components.KillStats);
  killStats.kills = PRACTICE_END_KILLS;

  const fleeingId = createSimpleEnemy(world, GAME_WIDTH + VANISH_MARGIN + 10, GROUND_Y);
  const ai = world.getComponent(fleeingId, Components.EnemyAI);
  ai.state = EnemyAIStates.FLEE;
  ai.fleeDir = 1;
  world.removeComponent(fleeingId, Components.BoundsConstrained);

  rig.step(1);
  check(
    world.getComponent(fleeingId, Components.Enemy) === undefined,
    'cap: fleeing enemy past the scene edge vanishes'
  );

  for (let i = 0; i < MAX_ACTIVE_ENEMIES; i++) {
    createSimpleEnemy(world, 100 + i * 50, GROUND_Y);
  }
  rig.step(121);
  check(
    enemyIds(world).length === MAX_ACTIVE_ENEMIES,
    'cap: vanish replacement is skipped while actives sit at the cap'
  );
}

function testWanderVanishReplacement() {
  const rig = makeFullRig();
  const world = rig.world;
  const score = world.getComponent(rig.gameEntity, Components.Score);
  const killStats = world.getComponent(rig.gameEntity, Components.KillStats);
  killStats.kills = 10;

  const enemyId = createSimpleEnemy(world, 1260, GROUND_Y);
  const ai = world.getComponent(enemyId, Components.EnemyAI);
  ai.state = EnemyAIStates.FLEE;
  ai.fleeDir = 1;
  world.removeComponent(enemyId, Components.BoundsConstrained);

  rig.step(80);
  check(
    world.getComponent(enemyId, Components.Enemy) === undefined,
    'vanish: enemy exiting scene x-bounds is destroyed'
  );
  check(score.value === 0, 'vanish: no score for a vanished enemy');
  check(killStats.kills === 10, 'vanish: no kill counted for a vanished enemy');
  check(enemyIds(world).length === 0, 'vanish: no replacement yet (2s delay pending)');

  rig.step(120);
  const ids = enemyIds(world);
  check(ids.length === 1, 'vanish: replacement spawned ~2s later');
  check(
    ids[0] !== enemyId &&
      world.getComponent(ids[0], Components.Enemy).type === EnemyTypes.SIMPLE,
    'vanish: replacement is the same type'
  );
}

function testFreshRunReset() {
  const world = createWorld();
  const gameEntity = makeGameEntity(world, GameStates.MENU);
  const inputEntity = world.createEntity();
  world.addComponent(inputEntity, Components.InputState, createInputState());

  const gameStateSystem = createGameStateSystem(world);
  const playerSpawnSystem = createPlayerSpawnSystem(world);
  const spawnSystem = createSpawnSystem(world);
  playerSpawnSystem.init();

  function step(count = 1) {
    for (let i = 0; i < count; i++) {
      gameStateSystem.update(DT);
      playerSpawnSystem.update(DT);
      spawnSystem.update(DT);
    }
  }

  const score = world.getComponent(gameEntity, Components.Score);
  const killStats = world.getComponent(gameEntity, Components.KillStats);
  const gameState = world.getComponent(gameEntity, Components.GameState);

  gameState.request = GameStates.PLAYING;
  step(2);
  check(world.queryFirst(Components.Player) !== undefined, 'reset: player spawned on first run');

  const staleEnemyId = createMediumEnemy(world, 500, GROUND_Y);
  createBullet(world, 300, GROUND_Y + 20, 1, 0, { buildingId: null, floor: 0 });
  createMuzzleFlash(world, 300, GROUND_Y + 20);
  score.value = 750;
  killStats.kills = 9;

  gameState.request = GameStates.MENU;
  step(2);

  gameState.request = GameStates.PLAYING;
  step(2);

  check(
    world.getComponent(staleEnemyId, Components.Enemy) === undefined,
    'reset: stale enemies destroyed on fresh run'
  );
  check(world.query(Components.Projectile).length === 0, 'reset: projectiles destroyed on fresh run');
  check(world.query(Components.Lifetime).length === 0, 'reset: flash entities destroyed on fresh run');
  check(score.value === 0, 'reset: score wiped on fresh run');
  check(killStats.kills === 0, 'reset: kills wiped on fresh run');
  check(world.queryFirst(Components.Player) !== undefined, 'reset: fresh player spawned');

  const ids = enemyIds(world);
  check(
    ids.length === 1 && world.getComponent(ids[0], Components.Enemy).type === EnemyTypes.SIMPLE,
    'reset: only the fresh practice enemy remains'
  );
}

function makeDomStubs() {
  function makeElement() {
    const el = {
      className: '',
      textContent: '',
      style: {},
      children: [],
      parentNode: null,
      appendChild(child) {
        child.parentNode = el;
        el.children.push(child);
        return child;
      },
      removeChild(child) {
        const index = el.children.indexOf(child);
        if (index !== -1) {
          el.children.splice(index, 1);
        }
        child.parentNode = null;
        return child;
      },
      addEventListener() {},
      removeEventListener() {},
    };
    return el;
  }
  return { root: makeElement(), makeElement };
}

function testHudShowsKills() {
  const { root, makeElement } = makeDomStubs();
  globalThis.document = { createElement: () => makeElement() };

  const world = createWorld();
  const gameEntity = makeGameEntity(world);
  const killStats = world.getComponent(gameEntity, Components.KillStats);
  const hudSystem = createHudSystem(world, root);
  hudSystem.init();

  const hudElement = root.children.find((c) => c.className === 'hud');
  const killsElement = hudElement.children.find((c) => c.className === 'hud-kills');
  check(killsElement !== undefined, 'hud: kills element exists next to score');
  check(killsElement.textContent === 'KILLS 000', 'hud: kills start at 000');
  check(hudElement.style.display === 'block', 'hud: visible while PLAYING');

  killStats.kills = 5;
  hudSystem.update();
  check(killsElement.textContent === 'KILLS 005', 'hud: kills update from KillStats');

  hudSystem.dispose();
  delete globalThis.document;
}

const tests = [
  testFactories,
  testDamageScoreAndKills,
  testEnemy2DeathAnimTenFrames,
  testPracticePeriod,
  testSpawnDirectorSilentOutsidePlaying,
  testWaveBudgetMath,
  testWaveComposition,
  testBudgetWaveIntegration,
  testActiveCapEnforced,
  testNoSpawnOnPlayerFloor,
  testIndoorSpawnKeepsBounds,
  testOutdoorSeek,
  testAttackStateNearPlayer,
  testLadderEngageClimbDismount,
  testStairsEngageTowardPlayerFloor,
  testDoorwayEntryRouting,
  testDoorwayExitRouting,
  testFleeDecision,
  testSeekContactKillsPlayer,
  testStationaryPlayerFatalAllTypes,
  testIndoorSpawnWhilePlayerDead,
  testReplacementRespectsActiveCap,
  testWanderVanishReplacement,
  testFreshRunReset,
  testHudShowsKills,
];

for (const test of tests) {
  test();
}

console.log('---');
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) {
  process.exitCode = 1;
}
