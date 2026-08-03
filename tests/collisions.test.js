import { createWorld } from '../js/ecs/world.js';
import {
  Components,
  GameStates,
  ClimbingModes,
  BuildingIds,
  AnimStates,
  Teams,
  createGameState,
  createBestScore,
  createScore,
  createInputState,
  createPosition,
  createVelocity,
  createBody,
  createGrounded,
  createClimbing,
  createInsideBuilding,
  createTeam,
  createHealth,
  createPlayer,
  createFacing,
  createAnimState,
  createSprite,
  createShooting,
  createWeapon,
  createMusicTrack,
  createProjectile,
} from '../js/ecs/components.js';
import { createCollisionSystem } from '../js/ecs/systems/collisionSystem.js';
import { createDamageSystem, ENEMY_DEATH_DURATION, PLAYER_DEATH_DURATION, KILL_SCORE } from '../js/ecs/systems/damageSystem.js';
import { createDeathAnimSystem } from '../js/ecs/systems/deathAnimSystem.js';
import { createProjectileSystem } from '../js/ecs/systems/projectileSystem.js';
import { createLifetimeSystem } from '../js/ecs/systems/lifetimeSystem.js';
import { createGameStateSystem } from '../js/ecs/systems/gameStateSystem.js';
import { createUISystem } from '../js/ecs/systems/uiSystem.js';
import { createAudioSystem } from '../js/ecs/systems/audioSystem.js';
import { createSimpleEnemy, createBullet } from '../js/ecs/factories.js';
import { LAYOUT, GAME_WIDTH } from '../js/world/layout.js';

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

function makeRig() {
  const world = createWorld();
  const gameEntity = world.createEntity();
  world.addComponent(gameEntity, Components.GameState, createGameState(GameStates.PLAYING));
  world.addComponent(gameEntity, Components.Score, createScore(0));
  world.addComponent(gameEntity, Components.BestScore, createBestScore(0));
  const inputEntity = world.createEntity();
  world.addComponent(inputEntity, Components.InputState, createInputState());

  const gameStateSystem = createGameStateSystem(world);
  const collisionSystem = createCollisionSystem(world);
  const deathAnimSystem = createDeathAnimSystem(world);
  const damageSystem = createDamageSystem(world, collisionSystem);
  const projectileSystem = createProjectileSystem(world);
  const lifetimeSystem = createLifetimeSystem(world);

  function step(count = 1) {
    for (let i = 0; i < count; i++) {
      gameStateSystem.update(DT);
      collisionSystem.update(DT);
      deathAnimSystem.update(DT);
      damageSystem.update(DT);
      projectileSystem.update(DT);
      lifetimeSystem.update(DT);
    }
  }

  return { world, gameEntity, collisionSystem, step };
}

function addPlayer(rig, { x, y = GROUND_Y, buildingId = null, floor = 0, climbingMode = ClimbingModes.NONE, betweenFloors = false }) {
  const world = rig.world;
  const id = world.createEntity();
  world.addComponent(id, Components.Player, createPlayer());
  world.addComponent(id, Components.Position, createPosition(x, y));
  world.addComponent(id, Components.Velocity, createVelocity(0, 0));
  world.addComponent(id, Components.Body, createBody(24, 40));
  world.addComponent(id, Components.Grounded, createGrounded(true, null));
  world.addComponent(id, Components.Climbing, createClimbing(climbingMode));
  world.getComponent(id, Components.Climbing).betweenFloors = betweenFloors;
  world.addComponent(id, Components.InsideBuilding, createInsideBuilding(buildingId, floor));
  world.addComponent(id, Components.Team, createTeam(Teams.PLAYER));
  world.addComponent(id, Components.Facing, createFacing());
  world.addComponent(id, Components.AnimState, createAnimState(AnimStates.IDLE));
  world.addComponent(id, Components.Sprite, createSprite({
    sheet: 'assets/player_idle.png', frameW: 32, frameH: 48, cols: 6, rows: 1,
  }));
  world.addComponent(id, Components.Shooting, createShooting(false));
  world.addComponent(id, Components.Weapon, createWeapon());
  return id;
}

function addEnemy(rig, { x, y = GROUND_Y, hp = 1, buildingId = null, floor = 0, climbingMode = ClimbingModes.NONE, betweenFloors = false }) {
  const world = rig.world;
  const id = createSimpleEnemy(world, x, y);
  const health = world.getComponent(id, Components.Health);
  health.hp = hp;
  health.maxHp = hp;
  const inside = world.getComponent(id, Components.InsideBuilding);
  inside.buildingId = buildingId;
  inside.floor = floor;
  const climbing = world.getComponent(id, Components.Climbing);
  climbing.mode = climbingMode;
  climbing.betweenFloors = betweenFloors;
  return id;
}

function testSameContextDetection() {
  const rig = makeRig();
  addPlayer(rig, { x: 300 });
  addEnemy(rig, { x: 310 });
  rig.step(1);
  check(rig.collisionSystem.getPlayerEnemyOverlaps().length === 1, 'context: outdoor overlap detected in same context');

  const farRig = makeRig();
  addPlayer(farRig, { x: 300 });
  addEnemy(farRig, { x: 400 });
  farRig.step(1);
  check(farRig.collisionSystem.getPlayerEnemyOverlaps().length === 0, 'context: no overlap when bodies apart');

  const floorZeroY = LAYOUT.buildings.left.floors[0].y;
  const indoorRig = makeRig();
  addPlayer(indoorRig, { x: 300, y: floorZeroY, buildingId: BuildingIds.LEFT, floor: 0 });
  addEnemy(indoorRig, { x: 305, y: floorZeroY, buildingId: BuildingIds.LEFT, floor: 0 });
  indoorRig.step(1);
  check(indoorRig.collisionSystem.getPlayerEnemyOverlaps().length === 1, 'context: same building same floor collides');

  const crossFloorRig = makeRig();
  addPlayer(crossFloorRig, { x: 300, y: floorZeroY, buildingId: BuildingIds.LEFT, floor: 0 });
  addEnemy(crossFloorRig, { x: 300, y: floorZeroY + 30, buildingId: BuildingIds.LEFT, floor: 1 });
  crossFloorRig.step(1);
  check(crossFloorRig.collisionSystem.getPlayerEnemyOverlaps().length === 0, 'context: same building different floors does not collide');

  const crossZoneRig = makeRig();
  addPlayer(crossZoneRig, { x: 300 });
  addEnemy(crossZoneRig, { x: 305, y: floorZeroY, buildingId: BuildingIds.LEFT, floor: 0 });
  crossZoneRig.step(1);
  check(crossZoneRig.collisionSystem.getPlayerEnemyOverlaps().length === 0, 'context: outdoor vs indoor does not collide');

  const crossBuildingRig = makeRig();
  const rightFloorZeroY = LAYOUT.buildings.right.floors[0].y;
  addPlayer(crossBuildingRig, { x: 800, y: rightFloorZeroY, buildingId: BuildingIds.RIGHT, floor: 0 });
  addEnemy(crossBuildingRig, { x: 805, y: rightFloorZeroY, buildingId: BuildingIds.LEFT, floor: 0 });
  crossBuildingRig.step(1);
  check(crossBuildingRig.collisionSystem.getPlayerEnemyOverlaps().length === 0, 'context: different buildings do not collide');
}

function testStairsIntangibility() {
  const floorZeroY = LAYOUT.buildings.left.floors[0].y;
  const rig = makeRig();
  const playerId = addPlayer(rig, { x: 600, y: floorZeroY, buildingId: BuildingIds.LEFT, floor: 0 });
  addEnemy(rig, {
    x: 605,
    y: floorZeroY + 60,
    buildingId: BuildingIds.LEFT,
    floor: 1,
    climbingMode: ClimbingModes.STAIRS,
    betweenFloors: true,
  });
  rig.step(1);
  check(rig.collisionSystem.getPlayerEnemyOverlaps().length === 0, 'stairs: enemy between floors is intangible');
  check(!rig.world.hasComponent(playerId, Components.Dead), 'stairs: player untouched by stairs-hidden enemy');

  const landingRig = makeRig();
  addPlayer(landingRig, { x: 600, y: floorZeroY, buildingId: BuildingIds.LEFT, floor: 0 });
  addEnemy(landingRig, {
    x: 605,
    y: floorZeroY,
    buildingId: BuildingIds.LEFT,
    floor: 0,
    climbingMode: ClimbingModes.STAIRS,
    betweenFloors: false,
  });
  landingRig.step(1);
  check(landingRig.collisionSystem.getPlayerEnemyOverlaps().length === 1, 'stairs: enemy snapped on landing is tangible');
}

function testLadderCrossFloorTangibility() {
  const rightFloors = LAYOUT.buildings.right.floors;
  const rig = makeRig();
  const playerId = addPlayer(rig, {
    x: 1040,
    y: rightFloors[2].y,
    buildingId: BuildingIds.RIGHT,
    floor: 2,
  });
  addEnemy(rig, {
    x: 1040,
    y: rightFloors[2].y + 20,
    buildingId: BuildingIds.RIGHT,
    floor: 1,
    climbingMode: ClimbingModes.LADDER,
    betweenFloors: true,
  });
  rig.step(1);
  check(rig.collisionSystem.getPlayerEnemyOverlaps().length === 1, 'ladder: enemy on ladder collides across floors');
  check(rig.world.hasComponent(playerId, Components.Dead), 'ladder: ladder enemy damages player on crossed path');
}

function testBulletDamagesEnemy() {
  const rig = makeRig();
  const enemyId = addEnemy(rig, { x: 400, hp: 2 });
  const inside = rig.world.getComponent(enemyId, Components.InsideBuilding);
  const bulletId = createBullet(rig.world, 360, GROUND_Y + 20, 1, 0, inside);
  rig.step(4);
  const health = rig.world.getComponent(enemyId, Components.Health);
  check(health.hp === 1, 'bullet: enemy hp reduced by bullet damage');
  check(!rig.world.hasComponent(enemyId, Components.Dead), 'bullet: enemy survives with hp left');
  const flash = rig.world.getComponent(enemyId, Components.HitFlash);
  check(flash !== undefined && flash.timer > 0, 'bullet: hit flash timer set on damaged enemy');
  check(!rig.world.hasComponent(bulletId, Components.Projectile), 'bullet: projectile destroyed on hit');
  const score = rig.world.getComponent(rig.gameEntity, Components.Score);
  check(score.value === 0, 'bullet: no score while enemy alive');
}

function testHitSparkLifecycle() {
  const rig = makeRig();
  const enemyId = addEnemy(rig, { x: 400, hp: 2 });
  const inside = rig.world.getComponent(enemyId, Components.InsideBuilding);
  createBullet(rig.world, 360, GROUND_Y + 20, 1, 0, inside);
  rig.step(4);

  const sparks = rig.world.query(Components.Lifetime);
  check(sparks.length === 1, 'spark: hit spark entity spawned on bullet impact');
  const sparkId = sparks[0];
  const sprite = rig.world.getComponent(sparkId, Components.Sprite);
  const renderable = rig.world.getComponent(sparkId, Components.Renderable);
  const lifetime = rig.world.getComponent(sparkId, Components.Lifetime);
  check(
    sprite.sheet === 'assets/hit_spark.png' && sprite.cols === 5 && sprite.rows === 1,
    'spark: hit_spark.png bound as 5x1 sheet'
  );
  check(
    renderable.width === 24 && renderable.height === 24 && renderable.z === 7,
    'spark: 24x24 quad at outdoor z=7'
  );
  check(
    lifetime.duration === 0.12 && lifetime.timer > 0 && lifetime.timer < lifetime.duration,
    'spark: 0.12s lifetime counting down from spawn'
  );

  rig.step(8);
  check(!rig.world.hasComponent(sparkId, Components.Lifetime), 'spark: destroyed when the lifetime expires');
}

function testIndoorHitSparkBehindFacadeMask() {
  const rig = makeRig();
  const floorZeroY = LAYOUT.buildings.right.floors[0].y;
  addEnemy(rig, { x: 800, y: floorZeroY, hp: 2, buildingId: BuildingIds.RIGHT, floor: 0 });
  createBullet(rig.world, 760, floorZeroY + 20, 1, 0, { buildingId: BuildingIds.RIGHT, floor: 0 });
  rig.step(4);

  const sparks = rig.world.query(Components.Lifetime);
  check(sparks.length === 1, 'spark-indoor: hit spark spawned on indoor impact');
  const renderable = rig.world.getComponent(sparks[0], Components.Renderable);
  check(renderable.z === 3.5, 'spark-indoor: indoor impact inherits the impact context (z=3.5, behind the facade mask)');
}

function testBulletZFollowsShooterContext() {
  const rig = makeRig();
  const outdoorBulletId = createBullet(rig.world, 100, GROUND_Y + 20, 1, 0, { buildingId: null, floor: 0 });
  check(
    rig.world.getComponent(outdoorBulletId, Components.Renderable).z === 6,
    'bullet-z: outdoor bullet keeps z=6'
  );
  const indoorBulletId = createBullet(rig.world, 800, GROUND_Y + 20, 1, 0, { buildingId: BuildingIds.RIGHT, floor: 1 });
  check(
    rig.world.getComponent(indoorBulletId, Components.Renderable).z === 3.5,
    'bullet-z: indoor bullet inherits the shooter context (z=3.5, behind the facade mask)'
  );
}

function testBulletKillDeathAndScore() {
  const rig = makeRig();
  const enemyId = addEnemy(rig, { x: 400, hp: 1 });
  const inside = rig.world.getComponent(enemyId, Components.InsideBuilding);
  createBullet(rig.world, 360, GROUND_Y + 20, 1, 0, inside);
  rig.step(4);

  check(rig.world.hasComponent(enemyId, Components.Dead), 'kill: hp 0 starts death sequence');
  const anim = rig.world.getComponent(enemyId, Components.AnimState);
  const sprite = rig.world.getComponent(enemyId, Components.Sprite);
  check(anim.state === AnimStates.DEATH, 'kill: death anim state set');
  check(
    sprite.sheet === 'assets/enemy_death.png' && sprite.cols === 4 && sprite.rows === 2,
    'kill: enemy_death sheet bound as 4x2 grid'
  );
  check(!rig.world.hasComponent(enemyId, Components.Gravity), 'kill: corpse loses gravity');
  check(!rig.world.hasComponent(enemyId, Components.Climbing), 'kill: corpse loses climbing (intangible)');
  check(!rig.world.hasComponent(enemyId, Components.InsideBuilding), 'kill: corpse loses zone context');
  const score = rig.world.getComponent(rig.gameEntity, Components.Score);
  check(score.value === KILL_SCORE, 'kill: +100 score on enemy death');

  rig.step(25);
  const animMid = rig.world.getComponent(enemyId, Components.AnimState);
  check(animMid !== undefined && animMid.frame > 0, 'kill: death anim frames advance');

  rig.step(Math.ceil(ENEMY_DEATH_DURATION / DT) + 10);
  check(!rig.world.hasComponent(enemyId, Components.AnimState), 'kill: enemy destroyed after death anim');
  check(rig.world.query(Components.Team).length === 0, 'kill: no enemy entities remain');
  check(score.value === KILL_SCORE, 'kill: score unchanged after corpse cleanup');
}

function testPlayerTouchDeathGameOver() {
  const rig = makeRig();
  const playerId = addPlayer(rig, { x: 300 });
  addEnemy(rig, { x: 308 });
  const gameState = rig.world.getComponent(rig.gameEntity, Components.GameState);

  rig.step(1);
  check(rig.world.hasComponent(playerId, Components.Dead), 'touch: player death sequence starts on enemy contact');
  const anim = rig.world.getComponent(playerId, Components.AnimState);
  const sprite = rig.world.getComponent(playerId, Components.Sprite);
  check(anim.state === AnimStates.DEATH, 'touch: player death anim state');
  check(
    sprite.sheet === 'assets/player_death.png' && sprite.cols === 8 && sprite.rows === 1,
    'touch: player_death sheet bound as 8x1 grid'
  );
  check(!rig.world.hasComponent(playerId, Components.Velocity), 'touch: controls locked (velocity removed)');
  check(!rig.world.hasComponent(playerId, Components.Shooting), 'touch: shooting removed while dying');
  check(gameState.current === GameStates.PLAYING, 'touch: still PLAYING during death anim');

  rig.step(Math.ceil(PLAYER_DEATH_DURATION / DT) + 5);
  check(gameState.current === GameStates.GAME_OVER, 'touch: GAME_OVER after player death anim');
  check(rig.world.hasComponent(playerId, Components.Player), 'touch: player entity kept for GAME_OVER screen');
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

function testBestScoreSavedOnGameOver() {
  const store = new Map([['neonVendettaBest', '50']]);
  globalThis.window = {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
    },
  };
  const { root } = makeDomStubs();
  globalThis.document = { createElement: () => makeDomStubs().makeElement() };

  const rig = makeRig();
  const uiSystem = createUISystem(rig.world, root);
  uiSystem.init();
  const bestScore = rig.world.getComponent(rig.gameEntity, Components.BestScore);
  check(bestScore.value === 50, 'best: loaded from storage on init');

  const score = rig.world.getComponent(rig.gameEntity, Components.Score);
  score.value = 300;
  addPlayer(rig, { x: 300 });
  addEnemy(rig, { x: 308 });

  function stepWithUi(count) {
    for (let i = 0; i < count; i++) {
      rig.step(1);
      uiSystem.update();
    }
  }
  stepWithUi(Math.ceil(PLAYER_DEATH_DURATION / DT) + 5);

  const gameState = rig.world.getComponent(rig.gameEntity, Components.GameState);
  check(gameState.current === GameStates.GAME_OVER, 'best: reached GAME_OVER');
  check(bestScore.value === 300, 'best: beaten best updated in component');
  check(store.get('neonVendettaBest') === '300', 'best: beaten best saved to localStorage');

  const gameOverEl = root.children.find((c) => c.className === 'game-over');
  check(gameOverEl !== undefined && gameOverEl.style.display === 'flex', 'best: GAME_OVER screen visible');

  delete globalThis.window;
  delete globalThis.document;
}

function testMusicPausesOnGameOver() {
  const played = [];
  class MockAudio {
    constructor(src) {
      this.src = src;
      this.paused = true;
      played.push(this);
    }
    play() {
      this.paused = false;
      return { then: (resolve) => resolve() };
    }
    pause() {
      this.paused = true;
    }
    addEventListener() {}
    removeEventListener() {}
    removeAttribute() {}
    load() {}
  }
  globalThis.Audio = MockAudio;
  const target = { addEventListener() {}, removeEventListener() {} };

  const rig = makeRig();
  const musicEntity = rig.world.createEntity();
  rig.world.addComponent(musicEntity, Components.MusicTrack, createMusicTrack('assets/music.ogg'));
  const audioSystem = createAudioSystem(rig.world, target);
  audioSystem.init();

  audioSystem.update();
  check(played.length === 1 && played[0].paused === false, 'music: playing during PLAYING');

  const gameState = rig.world.getComponent(rig.gameEntity, Components.GameState);
  gameState.request = GameStates.GAME_OVER;
  rig.step(1);
  audioSystem.update();
  check(played[0].paused === true, 'music: paused on GAME_OVER');

  audioSystem.dispose();
  delete globalThis.Audio;
}

function testBulletsDieAtContextBounds() {
  const rig = makeRig();
  const outdoorBullet = createBullet(rig.world, GAME_WIDTH - 20, GROUND_Y + 20, 1, 0, { buildingId: null, floor: 0 });
  rig.step(4);
  check(!rig.world.hasComponent(outdoorBullet, Components.Projectile), 'bounds: outdoor bullet dies at scene edge');

  const indoorRig = makeRig();
  const indoorBullet = createBullet(indoorRig.world, 20, LAYOUT.buildings.left.floors[0].y + 20, -1, 0, { buildingId: BuildingIds.LEFT, floor: 0 });
  indoorRig.step(4);
  check(!indoorRig.world.hasComponent(indoorBullet, Components.Projectile), 'bounds: indoor bullet dies at building wall');

  const aliveRig = makeRig();
  const aliveBullet = createBullet(aliveRig.world, 400, GROUND_Y + 20, 1, 0, { buildingId: BuildingIds.LEFT, floor: 0 });
  aliveRig.step(2);
  check(aliveRig.world.hasComponent(aliveBullet, Components.Projectile), 'bounds: bullet alive inside its context');
}

function testBulletZoneContextIsolation() {
  const rig = makeRig();
  const enemyId = addEnemy(rig, { x: 400, hp: 1 });
  createBullet(rig.world, 392, GROUND_Y + 20, 1, 0, { buildingId: BuildingIds.RIGHT, floor: 0 });
  rig.step(2);
  const health = rig.world.getComponent(enemyId, Components.Health);
  check(health.hp === 1, 'zone: indoor bullet does not hit outdoor enemy');
  check(rig.collisionSystem.getProjectileHits().length === 0, 'zone: no projectile hit across contexts');

  const indoorRig = makeRig();
  const floorZeroY = LAYOUT.buildings.right.floors[0].y;
  const indoorEnemyId = addEnemy(indoorRig, {
    x: 900,
    y: floorZeroY,
    hp: 1,
    buildingId: BuildingIds.RIGHT,
    floor: 0,
  });
  createBullet(indoorRig.world, 892, floorZeroY + 20, 1, 0, { buildingId: BuildingIds.RIGHT, floor: 0 });
  indoorRig.step(2);
  check(indoorRig.world.hasComponent(indoorEnemyId, Components.Dead), 'zone: same-context indoor bullet hits');
}

function testBulletHitsSameBuildingLadderEnemy() {
  const rig = makeRig();
  const rightFloors = LAYOUT.buildings.right.floors;
  const enemyId = addEnemy(rig, {
    x: 1040,
    y: rightFloors[2].y + 20,
    hp: 1,
    buildingId: BuildingIds.RIGHT,
    floor: 1,
    climbingMode: ClimbingModes.LADDER,
    betweenFloors: true,
  });
  createBullet(rig.world, 1032, rightFloors[2].y + 40, 1, 0, { buildingId: BuildingIds.RIGHT, floor: 2 });
  rig.step(1);
  check(rig.collisionSystem.getProjectileHits().length === 1, 'ladder-bullet: same-building bullet hits ladder enemy across floors');
  check(rig.world.hasComponent(enemyId, Components.Dead), 'ladder-bullet: same-building ladder enemy killed');
}

function testCrossBuildingBulletMissesLadderEnemy() {
  const rig = makeRig();
  const rightFloors = LAYOUT.buildings.right.floors;
  const enemyId = addEnemy(rig, {
    x: 1040,
    y: rightFloors[2].y + 20,
    hp: 1,
    buildingId: BuildingIds.RIGHT,
    floor: 1,
    climbingMode: ClimbingModes.LADDER,
    betweenFloors: true,
  });
  createBullet(rig.world, 1032, rightFloors[2].y + 40, 1, 0, { buildingId: BuildingIds.LEFT, floor: 2 });
  rig.step(1);
  check(rig.collisionSystem.getProjectileHits().length === 0, 'ladder-bullet: cross-building bullet cannot hit ladder enemy');
  const health = rig.world.getComponent(enemyId, Components.Health);
  check(health.hp === 1 && !rig.world.hasComponent(enemyId, Components.Dead), 'ladder-bullet: cross-building ladder enemy unharmed');
}

function testTwoClimbersSameLadderCollide() {
  const rig = makeRig();
  const rightFloors = LAYOUT.buildings.right.floors;
  const playerId = addPlayer(rig, {
    x: 1040,
    y: rightFloors[1].y + 30,
    buildingId: BuildingIds.RIGHT,
    floor: 1,
    climbingMode: ClimbingModes.LADDER,
    betweenFloors: true,
  });
  addEnemy(rig, {
    x: 1040,
    y: rightFloors[1].y + 40,
    buildingId: BuildingIds.RIGHT,
    floor: 2,
    climbingMode: ClimbingModes.LADDER,
    betweenFloors: true,
  });
  rig.step(1);
  check(rig.collisionSystem.getPlayerEnemyOverlaps().length === 1, 'ladder: two climbers on the same shaft collide');
  check(rig.world.hasComponent(playerId, Components.Dead), 'ladder: climber vs climber is fatal for the player');
}

function testOneBulletTwoStackedEnemies() {
  const rig = makeRig();
  const firstEnemyId = addEnemy(rig, { x: 400, hp: 1 });
  const secondEnemyId = addEnemy(rig, { x: 402, hp: 1 });
  const inside = rig.world.getComponent(firstEnemyId, Components.InsideBuilding);
  const bulletId = createBullet(rig.world, 392, GROUND_Y + 20, 1, 0, inside);
  rig.step(1);
  const firstDead = rig.world.hasComponent(firstEnemyId, Components.Dead);
  const secondDead = rig.world.hasComponent(secondEnemyId, Components.Dead);
  check(firstDead !== secondDead, 'no-pierce: exactly one of two stacked living enemies dies');
  const survivorId = firstDead ? secondEnemyId : firstEnemyId;
  const survivorHealth = rig.world.getComponent(survivorId, Components.Health);
  check(survivorHealth.hp === 1, 'no-pierce: surviving stacked enemy unharmed');
  check(!rig.world.hasComponent(bulletId, Components.Projectile), 'no-pierce: bullet destroyed on first living target');
  const score = rig.world.getComponent(rig.gameEntity, Components.Score);
  check(score.value === KILL_SCORE, 'no-pierce: +100 score applied exactly once');
}

function testOutdoorBulletHitsLadderEnemy() {
  const rig = makeRig();
  const rightFloors = LAYOUT.buildings.right.floors;
  const enemyId = addEnemy(rig, {
    x: 1040,
    y: rightFloors[0].y + 30,
    hp: 1,
    buildingId: BuildingIds.RIGHT,
    floor: 0,
    climbingMode: ClimbingModes.LADDER,
    betweenFloors: true,
  });
  createBullet(rig.world, 1032, rightFloors[0].y + 50, 1, 0, { buildingId: null, floor: 0 });
  rig.step(1);
  check(rig.collisionSystem.getProjectileHits().length === 1, 'ladder-bullet: outdoor bullet hits exterior-ladder enemy');
  check(rig.world.hasComponent(enemyId, Components.Dead), 'ladder-bullet: outdoor bullet kills exterior-ladder enemy');
}

function testOutdoorPlayerTouchesLadderEnemy() {
  const rig = makeRig();
  const rightFloors = LAYOUT.buildings.right.floors;
  const playerId = addPlayer(rig, { x: 1040 });
  addEnemy(rig, {
    x: 1040,
    y: rightFloors[0].y + 10,
    buildingId: BuildingIds.RIGHT,
    floor: 0,
    climbingMode: ClimbingModes.LADDER,
    betweenFloors: true,
  });
  rig.step(1);
  check(rig.collisionSystem.getPlayerEnemyOverlaps().length === 1, 'ladder: outdoor player body-touch reaches ladder enemy');
  check(rig.world.hasComponent(playerId, Components.Dead), 'ladder: descending ladder enemy is fatal to outdoor player');
}

function testContextlessProjectileIsInert() {
  const rig = makeRig();
  const enemyId = addEnemy(rig, { x: 400, hp: 1 });
  const bulletId = rig.world.createEntity();
  rig.world.addComponent(bulletId, Components.Projectile, createProjectile({ dx: 0, dy: 0, speed: 0 }));
  rig.world.addComponent(bulletId, Components.Position, createPosition(392, GROUND_Y + 20));
  rig.world.addComponent(bulletId, Components.Velocity, createVelocity(0, 0));
  rig.world.addComponent(bulletId, Components.Body, createBody(16, 4));
  rig.step(1);
  check(rig.collisionSystem.getProjectileHits().length === 0, 'null-context: contextless projectile hits nothing');
  const health = rig.world.getComponent(enemyId, Components.Health);
  check(health.hp === 1 && !rig.world.hasComponent(enemyId, Components.Dead), 'null-context: enemy unharmed by contextless projectile');
}

function testTwoBulletsOneEnemySameTick() {
  const rig = makeRig();
  const enemyId = addEnemy(rig, { x: 400, hp: 1 });
  const inside = rig.world.getComponent(enemyId, Components.InsideBuilding);
  const firstBulletId = createBullet(rig.world, 392, GROUND_Y + 20, 1, 0, inside);
  const secondBulletId = createBullet(rig.world, 394, GROUND_Y + 20, 1, 0, inside);
  rig.step(1);
  check(rig.world.hasComponent(enemyId, Components.Dead), 'double-hit: enemy dies once');
  const score = rig.world.getComponent(rig.gameEntity, Components.Score);
  check(score.value === KILL_SCORE, 'double-hit: score applied exactly once');
  check(!rig.world.hasComponent(firstBulletId, Components.Projectile), 'double-hit: first bullet destroyed');
  check(!rig.world.hasComponent(secondBulletId, Components.Projectile), 'double-hit: second bullet destroyed on dying target (no pierce)');
}

function testCorpseExcludedFromBroadphase() {
  const rig = makeRig();
  const enemyId = addEnemy(rig, { x: 400, hp: 1 });
  const inside = rig.world.getComponent(enemyId, Components.InsideBuilding);
  createBullet(rig.world, 392, GROUND_Y + 20, 1, 0, inside);
  rig.step(1);
  check(rig.world.hasComponent(enemyId, Components.Dead), 'corpse: enemy is dying');
  const lateBulletId = createBullet(rig.world, 392, GROUND_Y + 20, 1, 0, inside);
  rig.step(1);
  check(rig.collisionSystem.getProjectileHits().length === 0, 'corpse: corpse produces no projectile hits');
  check(rig.world.hasComponent(lateBulletId, Components.Projectile), 'corpse: bullet flies through corpse');
  const score = rig.world.getComponent(rig.gameEntity, Components.Score);
  check(score.value === KILL_SCORE, 'corpse: no double score from corpse');
}

function testEnterReturnsToMenuFromGameOver() {
  const rig = makeRig();
  const gameState = rig.world.getComponent(rig.gameEntity, Components.GameState);
  gameState.current = GameStates.GAME_OVER;
  const inputId = rig.world.queryFirst(Components.InputState);
  rig.world.getComponent(inputId, Components.InputState).justPressed.add('Enter');
  rig.step(1);
  check(gameState.current === GameStates.MENU, 'state: Enter returns to MENU from GAME_OVER');
  check(gameState.previous === GameStates.GAME_OVER, 'state: previous state recorded as GAME_OVER');
}

const tests = [
  testSameContextDetection,
  testStairsIntangibility,
  testLadderCrossFloorTangibility,
  testBulletDamagesEnemy,
  testHitSparkLifecycle,
  testIndoorHitSparkBehindFacadeMask,
  testBulletZFollowsShooterContext,
  testBulletKillDeathAndScore,
  testPlayerTouchDeathGameOver,
  testBestScoreSavedOnGameOver,
  testMusicPausesOnGameOver,
  testBulletsDieAtContextBounds,
  testBulletZoneContextIsolation,
  testBulletHitsSameBuildingLadderEnemy,
  testCrossBuildingBulletMissesLadderEnemy,
  testTwoClimbersSameLadderCollide,
  testOneBulletTwoStackedEnemies,
  testOutdoorBulletHitsLadderEnemy,
  testOutdoorPlayerTouchesLadderEnemy,
  testContextlessProjectileIsInert,
  testTwoBulletsOneEnemySameTick,
  testCorpseExcludedFromBroadphase,
  testEnterReturnsToMenuFromGameOver,
];

for (const test of tests) {
  test();
}

console.log('---');
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) {
  process.exitCode = 1;
}
