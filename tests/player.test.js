import { createWorld } from '../js/ecs/world.js';
import {
  Components,
  GameStates,
  ClimbingModes,
  BuildingIds,
  FacingDirs,
  AnimStates,
  createGameState,
  createInputState,
} from '../js/ecs/components.js';
import { createPlayerSpawnSystem } from '../js/ecs/systems/playerSpawnSystem.js';
import { createPlayerControllerSystem } from '../js/ecs/systems/playerControllerSystem.js';
import { createAnimationSystem } from '../js/ecs/systems/animationSystem.js';
import { createPhysicsSystem } from '../js/ecs/systems/physicsSystem.js';
import { createClimbSystem } from '../js/ecs/systems/climbSystem.js';
import { createBoundsSystem } from '../js/ecs/systems/boundsSystem.js';
import { createGameStateSystem } from '../js/ecs/systems/gameStateSystem.js';
import { LAYOUT } from '../js/world/layout.js';
import { OUTDOOR_FLOOR_ID } from '../js/world/floors.js';

const DT = 1 / 60;

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

function approx(actual, expected, epsilon = 1e-6) {
  return Math.abs(actual - expected) <= epsilon;
}

function makeRig() {
  const world = createWorld();

  const gameEntity = world.createEntity();
  world.addComponent(gameEntity, Components.GameState, createGameState());
  const inputEntity = world.createEntity();
  world.addComponent(inputEntity, Components.InputState, createInputState());

  const spawnSystem = createPlayerSpawnSystem(world);
  const controllerSystem = createPlayerControllerSystem(world);
  const physicsSystem = createPhysicsSystem(world);
  const climbSystem = createClimbSystem(world);
  const boundsSystem = createBoundsSystem(world);
  const gameStateSystem = createGameStateSystem(world);
  const animationSystem = createAnimationSystem(world);
  spawnSystem.init();

  const input = world.getComponent(inputEntity, Components.InputState);
  const gameState = world.getComponent(gameEntity, Components.GameState);

  function press(code) {
    input.pressed.add(code);
    input.justPressed.add(code);
  }

  function release(code) {
    input.pressed.delete(code);
    input.justReleased.add(code);
  }

  function releaseAll() {
    const held = Array.from(input.pressed);
    input.pressed.clear();
    for (let i = 0; i < held.length; i++) {
      input.justReleased.add(held[i]);
    }
  }

  function step(count = 1) {
    for (let i = 0; i < count; i++) {
      spawnSystem.update(DT);
      controllerSystem.update(DT);
      physicsSystem.update(DT);
      climbSystem.update(DT);
      boundsSystem.update(DT);
      gameStateSystem.update(DT);
      animationSystem.update(DT);
      input.justPressed.clear();
      input.justReleased.clear();
    }
  }

  function startGame() {
    gameState.request = GameStates.PLAYING;
    step(2);
  }

  function player() {
    return world.queryFirst(Components.Player);
  }

  function get(name) {
    return world.getComponent(player(), name);
  }

  return { world, input, gameState, press, release, releaseAll, step, startGame, player, get };
}

function placeOutdoors(rig, x) {
  const position = rig.get(Components.Position);
  const inside = rig.get(Components.InsideBuilding);
  const grounded = rig.get(Components.Grounded);
  const velocity = rig.get(Components.Velocity);
  position.x = x;
  position.y = LAYOUT.groundY;
  inside.buildingId = null;
  inside.floor = 0;
  grounded.value = true;
  grounded.floorId = OUTDOOR_FLOOR_ID;
  velocity.x = 0;
  velocity.y = 0;
}

function placeIndoors(rig, buildingId, floor, x) {
  const position = rig.get(Components.Position);
  const inside = rig.get(Components.InsideBuilding);
  const grounded = rig.get(Components.Grounded);
  const velocity = rig.get(Components.Velocity);
  position.x = x;
  position.y = LAYOUT.buildings[buildingId].floors[floor].y;
  inside.buildingId = buildingId;
  inside.floor = floor;
  grounded.value = true;
  grounded.floorId = buildingId + ':' + floor;
  velocity.x = 0;
  velocity.y = 0;
}

function testPlayerSpawnsOnPlaying() {
  const rig = makeRig();
  check(rig.player() === undefined, 'spawn: no player while in MENU');

  rig.startGame();
  check(rig.player() !== undefined, 'spawn: player exists after entering PLAYING');

  const position = rig.get(Components.Position);
  const body = rig.get(Components.Body);
  const grounded = rig.get(Components.Grounded);
  const climbing = rig.get(Components.Climbing);
  const inside = rig.get(Components.InsideBuilding);
  const facing = rig.get(Components.Facing);
  const anim = rig.get(Components.AnimState);
  const sprite = rig.get(Components.Sprite);
  const shooting = rig.get(Components.Shooting);
  const weapon = rig.get(Components.Weapon);
  const renderable = rig.get(Components.Renderable);

  check(position.x === 640 && approx(position.y, LAYOUT.groundY), 'spawn: starts on road at x=640, groundY');
  check(body.width === 24 && body.height === 40, 'spawn: body is 24x40');
  check(grounded.value === true && grounded.floorId === OUTDOOR_FLOOR_ID, 'spawn: grounded outdoors');
  check(climbing.mode === ClimbingModes.NONE, 'spawn: not climbing');
  check(inside.buildingId === null, 'spawn: outdoors');
  check(rig.world.hasComponent(rig.player(), Components.BoundsConstrained), 'spawn: BoundsConstrained present');
  check(rig.world.hasComponent(rig.player(), Components.Gravity), 'spawn: Gravity present');
  check(facing.dir === FacingDirs.RIGHT, 'spawn: facing right');
  check(anim.state === AnimStates.IDLE && anim.frame === 0, 'spawn: idle anim at frame 0');
  check(
    sprite.sheet === 'assets/player_idle.png' &&
      sprite.frameW === 32 &&
      sprite.frameH === 48 &&
      sprite.cols === 6 &&
      sprite.rows === 1 &&
      sprite.flipX === false,
    'spawn: sprite configured for idle sheet 32x48 6 frames'
  );
  check(shooting.active === false, 'spawn: not shooting');
  check(
    approx(weapon.fireInterval, 1 / 3) &&
      weapon.burstWindow === 1 &&
      weapon.cooldown === 0.5 &&
      weapon.heat === 0,
    'spawn: machine gun data (3rps, 1s burst window, 0.5s cooldown, cold)'
  );
  check(renderable.z === 5 && renderable.width === 32 && renderable.height === 48, 'spawn: renderable quad 32x48 at z=5');
}

function testPlayerDespawnsOnMenu() {
  const rig = makeRig();
  rig.startGame();
  const firstId = rig.player();
  check(firstId !== undefined, 'despawn: player exists in PLAYING');

  rig.gameState.request = GameStates.MENU;
  rig.step(2);
  check(rig.player() === undefined, 'despawn: player destroyed on return to MENU');
  check(rig.world.query(Components.Renderable).length === 0, 'despawn: player renderable removed from world');

  rig.gameState.request = GameStates.PLAYING;
  rig.step(2);
  const secondId = rig.player();
  check(secondId !== undefined && secondId !== firstId, 'despawn: re-entering PLAYING spawns a fresh player');
  check(rig.get(Components.Position).x === 640, 'despawn: respawned at start position');
}

function testWalkSetsVelocityAndFacing() {
  const rig = makeRig();
  rig.startGame();

  rig.press('KeyD');
  rig.step(1);
  const velocity = rig.get(Components.Velocity);
  const facing = rig.get(Components.Facing);
  const position = rig.get(Components.Position);
  check(velocity.x === 140, 'walk: D sets velocity +140 px/s');
  check(facing.dir === FacingDirs.RIGHT, 'walk: D faces right');

  rig.step(10);
  check(position.x > 640, 'walk: player moved right');

  rig.release('KeyD');
  rig.press('KeyA');
  rig.step(1);
  check(velocity.x === -140, 'walk: A sets velocity -140 px/s');
  check(facing.dir === FacingDirs.LEFT, 'walk: A faces left');

  rig.release('KeyA');
  rig.step(1);
  check(velocity.x === 0, 'walk: no keys stops horizontal movement');
  check(facing.dir === FacingDirs.LEFT, 'walk: facing keeps last direction');
}

function testDoorwayEnterExit() {
  const floorZeroY = LAYOUT.buildings.left.floors[0].y;
  const rig = makeRig();
  rig.startGame();
  placeOutdoors(rig, 300);

  rig.press('KeyW');
  rig.step(1);
  rig.release('KeyW');
  const inside = rig.get(Components.InsideBuilding);
  const position = rig.get(Components.Position);
  const grounded = rig.get(Components.Grounded);
  check(inside.buildingId === BuildingIds.LEFT && inside.floor === 0, 'doorway: W in doorway enters left building');
  check(approx(position.y, floorZeroY), 'doorway: stands on indoor floor 0 after entry');
  check(grounded.value === true && grounded.floorId === 'left:0', 'doorway: grounded indoors after entry');

  rig.press('KeyS');
  rig.step(1);
  rig.release('KeyS');
  check(inside.buildingId === null, 'doorway: S in doorway exits building');
  check(approx(position.y, LAYOUT.groundY), 'doorway: back at groundY after exit');
  check(grounded.value === true && grounded.floorId === OUTDOOR_FLOOR_ID, 'doorway: grounded outdoors after exit');
}

function testLadderEngageClimbDismount() {
  const ladder = LAYOUT.buildings.right.ladder;
  const floors = LAYOUT.buildings.right.floors;
  const rig = makeRig();
  rig.startGame();
  placeOutdoors(rig, 1040);

  rig.press('KeyW');
  rig.step(1);
  const climbing = rig.get(Components.Climbing);
  const velocity = rig.get(Components.Velocity);
  const inside = rig.get(Components.InsideBuilding);
  const position = rig.get(Components.Position);
  check(climbing.mode === ClimbingModes.LADDER, 'ladder: W at ladder base engages climb mode');
  check(velocity.y === 90, 'ladder: climbs up at 90 px/s');

  rig.step(60);
  check(position.y > ladder.minY + 60, 'ladder: climbed well above ladder base');
  check(inside.buildingId === BuildingIds.RIGHT, 'ladder: climbing assigns right building');
  check(inside.floor >= 1, 'ladder: floor advances while climbing');

  rig.release('KeyW');
  rig.press('KeyS');
  rig.step(120);
  check(climbing.mode === ClimbingModes.NONE, 'ladder: reaching the bottom on S dismounts');
  rig.release('KeyS');
  rig.step(3);
  const grounded = rig.get(Components.Grounded);
  check(grounded.value === true && grounded.floorId === 'right:0', 'ladder: grounded on right:0 after bottom dismount');
  check(approx(position.y, floors[0].y), 'ladder: stands at right floor 0 Y after dismount');

  rig.press('KeyW');
  rig.step(2);
  rig.release('KeyW');
  check(climbing.mode === ClimbingModes.LADDER, 'ladder: re-engaged from right building floor 0');
  rig.press('KeyA');
  rig.step(1);
  const facing = rig.get(Components.Facing);
  check(climbing.mode === ClimbingModes.NONE, 'ladder: A dismounts from the ladder');
  check(velocity.x === -140, 'ladder: dismount walks off at walk speed');
  check(facing.dir === FacingDirs.LEFT, 'ladder: dismount direction updates facing');
  rig.release('KeyA');
}

function testStairsTraverse() {
  const stairs = LAYOUT.buildings.left.stairs;
  const floors = LAYOUT.buildings.left.floors;
  const rig = makeRig();
  rig.startGame();
  placeIndoors(rig, BuildingIds.LEFT, 0, 600);

  rig.press('KeyW');
  rig.step(1);
  const climbing = rig.get(Components.Climbing);
  const inside = rig.get(Components.InsideBuilding);
  const position = rig.get(Components.Position);
  const velocity = rig.get(Components.Velocity);
  check(climbing.mode === ClimbingModes.STAIRS, 'stairs: W on stairs zone engages stairs mode');
  check(velocity.y === 90, 'stairs: climbs up at 90 px/s');

  rig.step(40);
  check(position.y > (floors[0].y + floors[1].y) / 2, 'stairs: moved past floor 0/1 midpoint');
  check(inside.floor >= 1, 'stairs: floor transitions while climbing');

  rig.step(200);
  check(position.y === stairs.maxY, 'stairs: clamped at top landing');
  check(inside.floor === floors.length - 1, 'stairs: top floor reached');
  check(climbing.betweenFloors === false, 'stairs: settled on top landing');

  rig.release('KeyW');
  rig.press('KeyD');
  rig.step(1);
  check(climbing.mode === ClimbingModes.NONE, 'stairs: D dismounts at the landing');
  check(velocity.x === 140, 'stairs: dismount walks at walk speed');
  rig.release('KeyD');
  rig.step(3);
  const grounded = rig.get(Components.Grounded);
  check(grounded.value === true && grounded.floorId === 'left:2', 'stairs: grounded on left:2 after dismount');
  check(inside.buildingId === BuildingIds.LEFT, 'stairs: still inside left building after dismount');
}

function testArrowsAimMostRecentWins() {
  const rig = makeRig();
  rig.startGame();

  rig.press('ArrowLeft');
  rig.step(1);
  const facing = rig.get(Components.Facing);
  const shooting = rig.get(Components.Shooting);
  check(facing.dir === FacingDirs.LEFT, 'aim: ArrowLeft aims left');
  check(shooting.active === true, 'aim: shooting intent active while arrow held');

  rig.press('ArrowRight');
  rig.step(1);
  check(facing.dir === FacingDirs.RIGHT, 'aim: most recent arrow wins (Right over held Left)');

  rig.press('ArrowUp');
  rig.step(1);
  check(facing.dir === FacingDirs.UP, 'aim: most recent wins with three held (Up)');

  rig.release('ArrowUp');
  rig.step(1);
  check(facing.dir === FacingDirs.RIGHT, 'aim: after release, most recent held arrow remains');

  rig.press('ArrowDown');
  rig.step(1);
  check(facing.dir === FacingDirs.DOWN, 'aim: ArrowDown aims down');

  rig.releaseAll();
  rig.step(1);
  check(shooting.active === false, 'aim: shooting intent cleared when no arrows held');
  check(facing.dir === FacingDirs.DOWN, 'aim: facing keeps last aim direction');
}

function testShootingIntentAndWeapon() {
  const rig = makeRig();
  rig.startGame();
  const shooting = rig.get(Components.Shooting);
  const weapon = rig.get(Components.Weapon);

  check(shooting.active === false, 'shooting: inactive without arrows');
  check(approx(weapon.fireInterval, 1 / 3), 'weapon: 3 shots per second');
  check(weapon.burstWindow === 1, 'weapon: 1s burst window before overheat');
  check(weapon.cooldown === 0.5, 'weapon: 0.5s forced cooldown');

  rig.press('ArrowRight');
  rig.step(1);
  check(shooting.active === true, 'shooting: active while arrow held');
  rig.release('ArrowRight');
  rig.step(1);
  check(shooting.active === false, 'shooting: inactive after release');
}

function testAnimStateTransitions() {
  const rig = makeRig();
  rig.startGame();
  const anim = rig.get(Components.AnimState);
  const sprite = rig.get(Components.Sprite);

  rig.step(10);
  check(anim.state === AnimStates.IDLE, 'anim: idle while standing');
  check(sprite.sheet === 'assets/player_idle.png' && sprite.cols === 6, 'anim: idle sheet bound');
  check(anim.frame > 0, 'anim: idle loops at ~8fps');

  rig.press('KeyD');
  rig.step(12);
  check(anim.state === AnimStates.RUN, 'anim: idle -> run on move');
  check(sprite.sheet === 'assets/player_move.png' && sprite.cols === 16, 'anim: run sheet bound (16 frames)');
  check(anim.frame > 0, 'anim: run advances at ~12fps');
  check(sprite.flipX === false, 'anim: run facing right unflipped');

  rig.release('KeyD');
  rig.press('KeyA');
  rig.step(1);
  check(anim.state === AnimStates.RUN, 'anim: still running left');
  check(sprite.flipX === true, 'anim: run facing left flips sprite');
  rig.release('KeyA');
  rig.step(1);

  rig.press('ArrowRight');
  rig.step(1);
  check(anim.state === AnimStates.SHOOT, 'anim: run -> shoot on aim while standing');
  check(sprite.sheet === 'assets/player_shoot.png' && sprite.cols === 6, 'anim: shoot sheet bound');
  check(anim.frame === 0, 'anim: shoot pose 0 aims right');
  check(sprite.flipX === false, 'anim: shoot poses encode direction (no flip)');

  rig.release('ArrowRight');
  rig.press('ArrowUp');
  rig.step(1);
  check(anim.frame === 2, 'anim: shoot pose 2 aims up');

  rig.release('ArrowUp');
  rig.press('ArrowDown');
  rig.step(1);
  check(anim.frame === 3, 'anim: shoot pose 3 aims down');

  rig.release('ArrowDown');
  rig.press('ArrowLeft');
  rig.step(1);
  check(anim.frame === 1, 'anim: shoot pose 1 aims left');

  rig.press('KeyD');
  rig.step(1);
  check(anim.state === AnimStates.RUN, 'anim: shooting while moving shows run anim');
  rig.release('ArrowLeft');
  rig.release('KeyD');
  rig.step(1);
  check(anim.state === AnimStates.IDLE, 'anim: back to idle');
}

function testAnimClimbAndPausedFrame() {
  const rig = makeRig();
  rig.startGame();
  placeOutdoors(rig, 1040);
  const anim = rig.get(Components.AnimState);
  const sprite = rig.get(Components.Sprite);

  rig.press('KeyW');
  rig.step(20);
  check(anim.state === AnimStates.CLIMB, 'anim: climb state on ladder');
  check(sprite.sheet === 'assets/player_climb.png' && sprite.cols === 6, 'anim: climb sheet bound');
  check(anim.frame > 0, 'anim: climb loops while moving on ladder');

  rig.release('KeyW');
  rig.step(2);
  const frozenFrame = anim.frame;
  rig.step(12);
  check(anim.state === AnimStates.CLIMB, 'anim: still climb state while hanging on ladder');
  check(anim.frame === frozenFrame, 'anim: climb frame paused while stationary on ladder');

  rig.press('KeyW');
  rig.step(12);
  check(anim.frame !== frozenFrame, 'anim: climb resumes when climbing again');
  rig.release('KeyW');
  rig.press('KeyA');
  rig.step(1);
  check(anim.state === AnimStates.RUN, 'anim: climb -> run on ladder dismount');
  rig.release('KeyA');
}

function testWOutsideDoorwayDoesNotEnter() {
  const rig = makeRig();
  rig.startGame();
  placeOutdoors(rig, 600);
  const inside = rig.get(Components.InsideBuilding);
  const position = rig.get(Components.Position);
  const velocity = rig.get(Components.Velocity);

  rig.press('KeyW');
  rig.step(1);
  check(inside.buildingId === null, 'doorway-gate: W outside doorway does not enter a building');
  check(velocity.y === 0, 'doorway-gate: W outside doorway gives no upward impulse');
  rig.step(10);
  check(approx(position.y, LAYOUT.groundY), 'doorway-gate: player stays at groundY (no hop)');
  rig.release('KeyW');

  placeOutdoors(rig, 500);
  rig.press('KeyW');
  rig.step(1);
  check(inside.buildingId === null, 'doorway-gate: W between doorway ranges does not enter');
  check(velocity.y === 0, 'doorway-gate: W between doorway ranges gives no impulse');
  rig.step(10);
  check(approx(position.y, LAYOUT.groundY), 'doorway-gate: still grounded after W between doorways');
  rig.release('KeyW');

  placeOutdoors(rig, 960);
  rig.press('KeyW');
  rig.step(1);
  check(inside.buildingId === BuildingIds.RIGHT && inside.floor === 0, 'doorway-gate: W in right doorway enters right building');
  rig.release('KeyW');
}

function testAimUpDownWhileOnLadder() {
  const rig = makeRig();
  rig.startGame();
  placeOutdoors(rig, 1040);

  rig.press('KeyW');
  rig.step(2);
  rig.release('KeyW');
  const climbing = rig.get(Components.Climbing);
  check(climbing.mode === ClimbingModes.LADDER, 'ladder-aim: on ladder');

  rig.press('ArrowUp');
  rig.step(1);
  const facing = rig.get(Components.Facing);
  const shooting = rig.get(Components.Shooting);
  const anim = rig.get(Components.AnimState);
  check(facing.dir === FacingDirs.UP, 'ladder-aim: ArrowUp aims up while on ladder');
  check(shooting.active === true, 'ladder-aim: shooting intent active on ladder');
  check(anim.state === AnimStates.CLIMB, 'ladder-aim: climb anim keeps priority over aim pose');

  rig.release('ArrowUp');
  rig.press('ArrowDown');
  rig.step(1);
  check(facing.dir === FacingDirs.DOWN, 'ladder-aim: ArrowDown aims down while on ladder');
  check(climbing.mode === ClimbingModes.LADDER, 'ladder-aim: aiming does not dismount the ladder');

  rig.release('ArrowDown');
  rig.step(1);
  check(shooting.active === false, 'ladder-aim: shooting intent cleared after release');
}

function testClimbBeatsShootAnimPriority() {
  const rig = makeRig();
  rig.startGame();
  placeOutdoors(rig, 1040);
  const anim = rig.get(Components.AnimState);
  const sprite = rig.get(Components.Sprite);

  rig.press('KeyW');
  rig.step(2);
  rig.release('KeyW');
  check(anim.state === AnimStates.CLIMB, 'priority: climbing on ladder');

  rig.press('ArrowRight');
  rig.step(1);
  check(anim.state === AnimStates.CLIMB, 'priority: climb anim wins over shoot while on ladder');
  check(sprite.sheet === 'assets/player_climb.png', 'priority: climb sheet stays bound while aiming on ladder');
  rig.release('ArrowRight');

  rig.press('KeyA');
  rig.step(1);
  rig.release('KeyA');
  check(anim.state === AnimStates.RUN, 'priority: after dismount run state resumes');
}

function testExactFpsFrameTiming() {
  const rig = makeRig();
  rig.startGame();
  const anim = rig.get(Components.AnimState);

  check(anim.state === AnimStates.IDLE && anim.frame === 0, 'fps: idle starts at frame 0');
  anim.frame = 0;
  anim.timer = 0;
  rig.step(7);
  check(anim.frame === 0, 'fps: idle still frame 0 after 7 ticks (7/60s < 1/8s)');
  rig.step(1);
  check(anim.frame === 1, 'fps: idle frame exactly 1 after 8 ticks (8fps)');

  rig.press('KeyD');
  rig.step(1);
  check(anim.state === AnimStates.RUN && anim.frame === 0, 'fps: run resets to frame 0');
  rig.step(3);
  check(anim.frame === 0, 'fps: run still frame 0 with 4 ticks accumulated (4/60s < 1/12s)');
  rig.step(2);
  check(anim.frame === 1, 'fps: run frame exactly 1 after 6 ticks accumulated (6/60s >= 1/12s)');
  rig.release('KeyD');
}

const tests = [
  testPlayerSpawnsOnPlaying,
  testPlayerDespawnsOnMenu,
  testWalkSetsVelocityAndFacing,
  testDoorwayEnterExit,
  testLadderEngageClimbDismount,
  testStairsTraverse,
  testArrowsAimMostRecentWins,
  testShootingIntentAndWeapon,
  testAnimStateTransitions,
  testAnimClimbAndPausedFrame,
  testWOutsideDoorwayDoesNotEnter,
  testAimUpDownWhileOnLadder,
  testClimbBeatsShootAnimPriority,
  testExactFpsFrameTiming,
];

for (const test of tests) {
  test();
}

console.log('---');
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) {
  process.exitCode = 1;
}
