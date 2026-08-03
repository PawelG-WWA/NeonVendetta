import { createWorld } from '../js/ecs/world.js';
import {
  Components,
  ClimbingModes,
  BuildingIds,
  createPosition,
  createVelocity,
  createBody,
  createGravity,
  createGrounded,
  createClimbing,
  createInsideBuilding,
  createBoundsConstrained,
} from '../js/ecs/components.js';
import { createPhysicsSystem } from '../js/ecs/systems/physicsSystem.js';
import { createClimbSystem } from '../js/ecs/systems/climbSystem.js';
import { createBoundsSystem } from '../js/ecs/systems/boundsSystem.js';
import { LAYOUT, GAME_WIDTH } from '../js/world/layout.js';
import { OUTDOOR_FLOOR_ID } from '../js/world/floors.js';

const DT = 1 / 60;
const BODY_WIDTH = 32;
const BODY_HEIGHT = 64;
const HALF_WIDTH = BODY_WIDTH / 2;

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

function makeRig(options = {}) {
  const world = createWorld();
  const physicsSystem = createPhysicsSystem(world);
  const climbSystem = createClimbSystem(world);
  const boundsSystem = createBoundsSystem(world);

  const id = world.createEntity();
  world.addComponent(id, Components.Position, createPosition(options.x ?? 600, options.y ?? 300));
  world.addComponent(id, Components.Velocity, createVelocity(options.vx ?? 0, options.vy ?? 0));
  world.addComponent(id, Components.Body, createBody(BODY_WIDTH, BODY_HEIGHT));
  world.addComponent(id, Components.Gravity, createGravity(options.gravity ?? 1));
  world.addComponent(id, Components.Grounded, createGrounded(options.grounded ?? false, options.floorId ?? null));
  world.addComponent(id, Components.Climbing, createClimbing(options.mode ?? ClimbingModes.NONE));
  world.addComponent(id, Components.InsideBuilding, createInsideBuilding(options.buildingId ?? null, options.floor ?? 0));
  world.addComponent(id, Components.BoundsConstrained, createBoundsConstrained());

  function step(count = 1) {
    for (let i = 0; i < count; i++) {
      physicsSystem.update(DT);
      climbSystem.update(DT);
      boundsSystem.update(DT);
    }
  }

  return { world, id, step };
}

function testGravityFallToGround() {
  const rig = makeRig({ x: 600, y: 300 });
  rig.step(120);
  const position = rig.world.getComponent(rig.id, Components.Position);
  const velocity = rig.world.getComponent(rig.id, Components.Velocity);
  const grounded = rig.world.getComponent(rig.id, Components.Grounded);
  check(approx(position.y, LAYOUT.groundY), 'gravity: outdoor entity falls to groundY');
  check(grounded.value === true, 'gravity: entity is grounded after landing');
  check(grounded.floorId === OUTDOOR_FLOOR_ID, 'gravity: floorId is ground after landing');
  check(velocity.y === 0, 'gravity: vertical velocity zeroed on landing');
}

function testBuildingFloorLanding() {
  const rig = makeRig({ x: 600, y: 400, buildingId: BuildingIds.LEFT, floor: 1 });
  rig.step(120);
  const position = rig.world.getComponent(rig.id, Components.Position);
  const grounded = rig.world.getComponent(rig.id, Components.Grounded);
  check(approx(position.y, LAYOUT.buildings.left.floors[1].y), 'floor: indoor entity lands on its building floor');
  check(grounded.value === true, 'floor: indoor entity grounded on building floor');
  check(grounded.floorId === 'left:1', 'floor: floorId identifies building floor');
}

function testGravityScaleZero() {
  const rig = makeRig({ x: 600, y: 300, gravity: 0 });
  rig.step(60);
  const position = rig.world.getComponent(rig.id, Components.Position);
  const grounded = rig.world.getComponent(rig.id, Components.Grounded);
  check(approx(position.y, 300), 'gravity: scale 0 entity is unaffected');
  check(grounded.value === false, 'gravity: scale 0 entity never grounds mid-air');
}

function testLadderClimbTransitions() {
  const ladder = LAYOUT.buildings.right.ladder;
  const floors = LAYOUT.buildings.right.floors;
  const rig = makeRig({ x: 1040, y: ladder.minY, mode: ClimbingModes.LADDER });
  const position = rig.world.getComponent(rig.id, Components.Position);
  const velocity = rig.world.getComponent(rig.id, Components.Velocity);
  const climbing = rig.world.getComponent(rig.id, Components.Climbing);
  const inside = rig.world.getComponent(rig.id, Components.InsideBuilding);
  const grounded = rig.world.getComponent(rig.id, Components.Grounded);

  rig.step(1);
  check(inside.buildingId === BuildingIds.RIGHT, 'ladder: climbing assigns right building');
  check(inside.floor === 0, 'ladder: starts at floor 0 at ladder bottom');
  check(grounded.value === false, 'ladder: not grounded while climbing');
  check(climbing.betweenFloors === false, 'ladder: not between floors exactly at floor Y');

  velocity.y = 240;
  rig.step(20);
  check(position.y > (floors[0].y + floors[1].y) / 2, 'ladder: moved past floor 0/1 midpoint');
  check(inside.floor === 1, 'ladder: floor transitions to 1 while climbing up');
  check(climbing.betweenFloors === true, 'ladder: betweenFloors flagged mid-climb');

  position.y = floors[2].y;
  velocity.y = 0;
  rig.step(1);
  check(inside.floor === 2, 'ladder: floor follows entity Y');
  check(climbing.betweenFloors === false, 'ladder: betweenFloors cleared at floor landing');

  velocity.y = 480;
  rig.step(120);
  check(position.y === ladder.maxY, 'ladder: clamped at ladder top');
  check(
    position.y === floors[floors.length - 1].y,
    'ladder: top clamp lands exactly on top floor Y'
  );
  check(velocity.y === 0, 'ladder: upward velocity zeroed at top');
  check(inside.floor === floors.length - 1, 'ladder: top floor reached at ladder top');
  check(
    climbing.betweenFloors === false,
    'ladder: top clamp reads as on the top floor (not between floors)'
  );

  velocity.y = -480;
  rig.step(240);
  check(position.y === ladder.minY, 'ladder: clamped at ladder bottom');
  check(inside.floor === 0, 'ladder: back to floor 0 at ladder bottom');

  velocity.x = 600;
  rig.step(30);
  check(position.x <= ladder.maxX - HALF_WIDTH, 'ladder: x clamped inside ladder range');
  check(position.x >= ladder.minX + HALF_WIDTH, 'ladder: x clamp keeps body in range');
}

function testLadderHoversWithoutGravity() {
  const rig = makeRig({ x: 1040, y: 400, mode: ClimbingModes.LADDER });
  rig.step(30);
  const position = rig.world.getComponent(rig.id, Components.Position);
  check(approx(position.y, 400), 'ladder: gravity off while climbing (hovers)');
}

function testStairsClimbTransitions() {
  const stairs = LAYOUT.buildings.left.stairs;
  const floors = LAYOUT.buildings.left.floors;
  const rig = makeRig({
    x: 600,
    y: floors[0].y,
    buildingId: BuildingIds.LEFT,
    floor: 0,
    mode: ClimbingModes.STAIRS,
  });
  const position = rig.world.getComponent(rig.id, Components.Position);
  const velocity = rig.world.getComponent(rig.id, Components.Velocity);
  const climbing = rig.world.getComponent(rig.id, Components.Climbing);
  const inside = rig.world.getComponent(rig.id, Components.InsideBuilding);

  velocity.y = 120;
  rig.step(31);
  const midpoint01 = (floors[0].y + floors[1].y) / 2;
  check(position.y > midpoint01, 'stairs: entity moved past floor 0/1 midpoint');
  check(inside.floor === 1, 'stairs: floor gradually transitions to 1');
  check(climbing.betweenFloors === true, 'stairs: betweenFloors flagged between floors');

  position.y = floors[2].y;
  velocity.y = 0;
  rig.step(1);
  check(inside.floor === 2, 'stairs: floor reaches 2 at top landing');
  check(climbing.betweenFloors === false, 'stairs: betweenFloors cleared on landing');

  position.x = stairs.minX + 2;
  rig.step(1);
  check(position.x === stairs.minX + HALF_WIDTH, 'stairs: x clamped inside stairs range');

  position.y = stairs.maxY + 100;
  rig.step(1);
  check(position.y === stairs.maxY, 'stairs: y clamped to stairs range');
  check(
    position.y === floors[floors.length - 1].y,
    'stairs: top clamp lands exactly on top floor Y'
  );
  check(inside.floor === floors.length - 1, 'stairs: top clamp reads as top floor');
  check(
    climbing.betweenFloors === false,
    'stairs: top clamp reads as on the top floor (not between floors)'
  );
}

function testDoorwayTransitions() {
  const floorZeroY = LAYOUT.buildings.left.floors[0].y;
  const rig = makeRig({
    x: 300,
    y: LAYOUT.groundY,
    grounded: true,
    floorId: OUTDOOR_FLOOR_ID,
  });
  const position = rig.world.getComponent(rig.id, Components.Position);
  const velocity = rig.world.getComponent(rig.id, Components.Velocity);
  const inside = rig.world.getComponent(rig.id, Components.InsideBuilding);
  const grounded = rig.world.getComponent(rig.id, Components.Grounded);

  velocity.y = 180;
  rig.step(1);
  check(inside.buildingId === BuildingIds.LEFT, 'doorway: upward velocity in doorway enters left building');
  check(inside.floor === 0, 'doorway: entry lands on indoor floor 0');
  check(approx(position.y, floorZeroY), 'doorway: entity stands at indoor floor Y after entry');
  check(grounded.value === true && grounded.floorId === 'left:0', 'doorway: grounded on indoor floor after entry');

  rig.step(10);
  check(approx(position.y, floorZeroY), 'doorway: indoor entity stays on floor 0');

  velocity.y = -180;
  rig.step(1);
  check(inside.buildingId === null, 'doorway: downward velocity in doorway exits outdoors');
  check(approx(position.y, LAYOUT.groundY), 'doorway: entity back at groundY after exit');
  check(grounded.value === true && grounded.floorId === OUTDOOR_FLOOR_ID, 'doorway: grounded outdoors after exit');
}

function testBuildingSolidOutsideDoorway() {
  const rig = makeRig({
    x: 600,
    y: LAYOUT.groundY,
    grounded: true,
    floorId: OUTDOOR_FLOOR_ID,
  });
  const velocity = rig.world.getComponent(rig.id, Components.Velocity);
  const inside = rig.world.getComponent(rig.id, Components.InsideBuilding);
  const position = rig.world.getComponent(rig.id, Components.Position);
  const grounded = rig.world.getComponent(rig.id, Components.Grounded);

  velocity.y = 180;
  rig.step(60);
  check(inside.buildingId === null, 'wall: no building entry outside doorway x-range');
  check(approx(position.y, LAYOUT.groundY), 'wall: outdoor entity settles back at groundY');
  check(grounded.value === true, 'wall: outdoor entity grounded after settling');
}

function testXBoundsClamping() {
  const rig = makeRig({
    x: 600,
    y: LAYOUT.groundY,
    grounded: true,
    floorId: OUTDOOR_FLOOR_ID,
  });
  const position = rig.world.getComponent(rig.id, Components.Position);
  const velocity = rig.world.getComponent(rig.id, Components.Velocity);
  const inside = rig.world.getComponent(rig.id, Components.InsideBuilding);

  velocity.x = 6000;
  rig.step(10);
  check(position.x === GAME_WIDTH - HALF_WIDTH, 'bounds: outdoor x clamped at right scene edge');

  velocity.x = -6000;
  rig.step(20);
  check(position.x === HALF_WIDTH, 'bounds: outdoor x clamped at left scene edge');

  inside.buildingId = BuildingIds.LEFT;
  inside.floor = 0;
  position.x = 400;
  position.y = LAYOUT.buildings.left.floors[0].y;
  velocity.x = 6000;
  rig.step(5);
  check(position.x === LAYOUT.buildings.left.maxX - HALF_WIDTH, 'bounds: indoor x clamped at building right wall');

  velocity.x = -6000;
  rig.step(10);
  check(position.x === LAYOUT.buildings.left.minX + HALF_WIDTH, 'bounds: indoor x clamped at building left wall');
}

function testRogueLadderEngagementRejected() {
  const rig = makeRig({
    x: 100,
    y: LAYOUT.groundY,
    grounded: true,
    floorId: OUTDOOR_FLOOR_ID,
    mode: ClimbingModes.LADDER,
  });
  const position = rig.world.getComponent(rig.id, Components.Position);
  const climbing = rig.world.getComponent(rig.id, Components.Climbing);
  const inside = rig.world.getComponent(rig.id, Components.InsideBuilding);

  rig.step(1);
  check(climbing.mode === ClimbingModes.NONE, 'gating: rogue ladder engagement at x=100 rejected');
  check(position.x === 100, 'gating: rejected entity is not teleported to the ladder');
  check(inside.buildingId === null, 'gating: rejected entity stays outdoors');
  check(climbing.betweenFloors === false, 'gating: rejection clears betweenFloors');

  const wrongBuildingRig = makeRig({
    x: 1040,
    y: LAYOUT.buildings.left.floors[0].y,
    buildingId: BuildingIds.LEFT,
    floor: 0,
    grounded: true,
    floorId: 'left:0',
    mode: ClimbingModes.LADDER,
  });
  const wrongClimbing = wrongBuildingRig.world.getComponent(wrongBuildingRig.id, Components.Climbing);
  const wrongInside = wrongBuildingRig.world.getComponent(wrongBuildingRig.id, Components.InsideBuilding);
  wrongBuildingRig.step(1);
  check(wrongClimbing.mode === ClimbingModes.NONE, 'gating: ladder engagement inside left building rejected');
  check(wrongInside.buildingId === BuildingIds.LEFT, 'gating: rejected entity keeps its building');
}

function testRogueStairsEngagementRejected() {
  const outdoorRig = makeRig({
    x: 600,
    y: LAYOUT.groundY,
    grounded: true,
    floorId: OUTDOOR_FLOOR_ID,
    mode: ClimbingModes.STAIRS,
  });
  const outdoorPosition = outdoorRig.world.getComponent(outdoorRig.id, Components.Position);
  const outdoorClimbing = outdoorRig.world.getComponent(outdoorRig.id, Components.Climbing);
  const outdoorInside = outdoorRig.world.getComponent(outdoorRig.id, Components.InsideBuilding);
  outdoorRig.step(1);
  check(outdoorClimbing.mode === ClimbingModes.NONE, 'gating: stairs engagement outdoors rejected');
  check(outdoorPosition.x === 600, 'gating: rejected stairs entity is not teleported');
  check(outdoorInside.buildingId === null, 'gating: rejected stairs entity stays outdoors');

  const wrongXRig = makeRig({
    x: 100,
    y: LAYOUT.buildings.left.floors[0].y,
    buildingId: BuildingIds.LEFT,
    floor: 0,
    grounded: true,
    floorId: 'left:0',
    mode: ClimbingModes.STAIRS,
  });
  const wrongXPosition = wrongXRig.world.getComponent(wrongXRig.id, Components.Position);
  const wrongXClimbing = wrongXRig.world.getComponent(wrongXRig.id, Components.Climbing);
  const wrongXInside = wrongXRig.world.getComponent(wrongXRig.id, Components.InsideBuilding);
  wrongXRig.step(1);
  check(wrongXClimbing.mode === ClimbingModes.NONE, 'gating: stairs engagement outside stairs x-range rejected');
  check(wrongXPosition.x === 100, 'gating: rejected entity keeps its x');
  check(wrongXInside.buildingId === BuildingIds.LEFT, 'gating: rejected entity stays in left building');
}

function testDoorwayMidAirEntryRejected() {
  const rig = makeRig({ x: 300, y: 300, vy: 180 });
  const position = rig.world.getComponent(rig.id, Components.Position);
  const inside = rig.world.getComponent(rig.id, Components.InsideBuilding);
  const grounded = rig.world.getComponent(rig.id, Components.Grounded);

  rig.step(1);
  check(inside.buildingId === null, 'doorway: mid-air body above doorway y-band is not kidnapped');

  rig.step(120);
  check(inside.buildingId === null, 'doorway: entity stays outdoors after landing');
  check(approx(position.y, LAYOUT.groundY), 'doorway: entity lands at groundY');
  check(grounded.value === true && grounded.floorId === OUTDOOR_FLOOR_ID, 'doorway: grounded outdoors after landing');
}

function testDoorwayMidAirExitRejected() {
  const floorZeroY = LAYOUT.buildings.left.floors[0].y;
  const rig = makeRig({
    x: 300,
    y: floorZeroY + 60,
    vy: -100,
    buildingId: BuildingIds.LEFT,
    floor: 0,
  });
  const position = rig.world.getComponent(rig.id, Components.Position);
  const inside = rig.world.getComponent(rig.id, Components.InsideBuilding);
  const grounded = rig.world.getComponent(rig.id, Components.Grounded);

  rig.step(1);
  check(inside.buildingId === BuildingIds.LEFT, 'doorway: mid-air descent in doorway does not eject');

  rig.step(60);
  check(inside.buildingId === BuildingIds.LEFT, 'doorway: still indoors after landing in doorway');
  check(approx(position.y, floorZeroY), 'doorway: landed back on indoor floor 0');
  check(grounded.value === true && grounded.floorId === 'left:0', 'doorway: grounded on floor 0 after landing');
}

function testRightBuildingDoorwayEntryExit() {
  const floorZeroY = LAYOUT.buildings.right.floors[0].y;
  const rig = makeRig({
    x: 960,
    y: LAYOUT.groundY,
    grounded: true,
    floorId: OUTDOOR_FLOOR_ID,
  });
  const position = rig.world.getComponent(rig.id, Components.Position);
  const velocity = rig.world.getComponent(rig.id, Components.Velocity);
  const inside = rig.world.getComponent(rig.id, Components.InsideBuilding);
  const grounded = rig.world.getComponent(rig.id, Components.Grounded);

  velocity.y = 180;
  rig.step(1);
  check(inside.buildingId === BuildingIds.RIGHT, 'entrance: upward velocity in right entrance enters right building');
  check(inside.floor === 0, 'entrance: entry lands on right floor 0');
  check(approx(position.y, floorZeroY), 'entrance: entity stands at right floor 0 Y after entry');
  check(grounded.value === true && grounded.floorId === 'right:0', 'entrance: grounded on right:0 after entry');

  rig.step(10);
  check(approx(position.y, floorZeroY), 'entrance: entity stays on right floor 0');

  velocity.y = -180;
  rig.step(1);
  check(inside.buildingId === null, 'entrance: grounded down intent in right entrance exits outdoors');
  check(approx(position.y, LAYOUT.groundY), 'entrance: entity back at groundY after exit');
  check(grounded.value === true && grounded.floorId === OUTDOOR_FLOOR_ID, 'entrance: grounded outdoors after exit');
}

function testRightBuildingExitViaEntrance() {
  const ladder = LAYOUT.buildings.right.ladder;
  const doorway = LAYOUT.buildings.right.doorway;
  const rig = makeRig({ x: 1040, y: ladder.minY, mode: ClimbingModes.LADDER });
  const position = rig.world.getComponent(rig.id, Components.Position);
  const velocity = rig.world.getComponent(rig.id, Components.Velocity);
  const climbing = rig.world.getComponent(rig.id, Components.Climbing);
  const inside = rig.world.getComponent(rig.id, Components.InsideBuilding);
  const grounded = rig.world.getComponent(rig.id, Components.Grounded);

  rig.step(1);
  check(inside.buildingId === BuildingIds.RIGHT && inside.floor === 0, 'exit-path: ladder bottom is right floor 0');

  climbing.mode = ClimbingModes.NONE;
  rig.step(5);
  check(grounded.value === true && grounded.floorId === 'right:0', 'exit-path: ladder-bottom dismount grounds on right:0');

  velocity.x = -240;
  rig.step(20);
  velocity.x = 0;
  check(position.x >= doorway.minX && position.x < doorway.maxX, 'exit-path: walked into the right entrance zone');

  velocity.y = -180;
  rig.step(1);
  check(inside.buildingId === null, 'exit-path: down intent at right entrance exits outdoors');
  check(approx(position.y, LAYOUT.groundY), 'exit-path: exit lands at groundY');
  check(grounded.value === true && grounded.floorId === OUTDOOR_FLOOR_ID, 'exit-path: grounded outdoors after exit');
}

function testLadderDismountLandsOnFloor() {
  const floors = LAYOUT.buildings.right.floors;
  const rig = makeRig({ x: 1040, y: floors[2].y, mode: ClimbingModes.LADDER });
  const position = rig.world.getComponent(rig.id, Components.Position);
  const velocity = rig.world.getComponent(rig.id, Components.Velocity);
  const climbing = rig.world.getComponent(rig.id, Components.Climbing);
  const inside = rig.world.getComponent(rig.id, Components.InsideBuilding);
  const grounded = rig.world.getComponent(rig.id, Components.Grounded);

  rig.step(1);
  check(inside.floor === 2, 'dismount: floor tracked while climbing');
  check(climbing.betweenFloors === false, 'dismount: settled exactly on floor 2 while climbing');

  climbing.mode = ClimbingModes.NONE;
  rig.step(10);
  check(approx(position.y, floors[2].y), 'dismount: entity stays on floor 2 Y');
  check(grounded.value === true && grounded.floorId === 'right:2', 'dismount: grounded on right:2 after dismount');
  check(velocity.y === 0, 'dismount: vertical velocity zeroed after landing');
}

function testHighVelocityFallNoTunneling() {
  const outdoorRig = makeRig({ x: 600, y: 300, vy: -50000 });
  const outdoorPosition = outdoorRig.world.getComponent(outdoorRig.id, Components.Position);
  const outdoorVelocity = outdoorRig.world.getComponent(outdoorRig.id, Components.Velocity);
  const outdoorGrounded = outdoorRig.world.getComponent(outdoorRig.id, Components.Grounded);
  outdoorRig.step(1);
  check(approx(outdoorPosition.y, LAYOUT.groundY), 'fall: high-velocity fall does not tunnel past groundY');
  check(outdoorGrounded.value === true && outdoorGrounded.floorId === OUTDOOR_FLOOR_ID, 'fall: grounded after high-velocity fall');
  check(outdoorVelocity.y === 0, 'fall: velocity zeroed after high-velocity landing');

  const indoorRig = makeRig({
    x: 600,
    y: 600,
    vy: -50000,
    buildingId: BuildingIds.LEFT,
    floor: 1,
  });
  const indoorPosition = indoorRig.world.getComponent(indoorRig.id, Components.Position);
  const indoorGrounded = indoorRig.world.getComponent(indoorRig.id, Components.Grounded);
  indoorRig.step(1);
  check(approx(indoorPosition.y, LAYOUT.buildings.left.floors[1].y), 'fall: indoor high-velocity fall lands on its floor');
  check(indoorGrounded.value === true && indoorGrounded.floorId === 'left:1', 'fall: indoor grounded after high-velocity fall');
}

function testStaleDownwardIntentConsumed() {
  const floorZeroY = LAYOUT.buildings.left.floors[0].y;
  const rig = makeRig({
    x: 600,
    y: floorZeroY,
    grounded: true,
    floorId: 'left:0',
    buildingId: BuildingIds.LEFT,
    floor: 0,
  });
  const position = rig.world.getComponent(rig.id, Components.Position);
  const velocity = rig.world.getComponent(rig.id, Components.Velocity);
  const inside = rig.world.getComponent(rig.id, Components.InsideBuilding);

  velocity.y = -180;
  rig.step(1);
  check(inside.buildingId === BuildingIds.LEFT, 'intent: no exit outside doorway x-range');
  check(velocity.y === 0, 'intent: unconsumed downward velocity zeroed while grounded');
  check(approx(position.y, floorZeroY), 'intent: entity remains on floor 0');

  position.x = 300;
  rig.step(1);
  check(inside.buildingId === BuildingIds.LEFT, 'intent: drifting into doorway with stale intent does not exit');

  velocity.y = -180;
  rig.step(1);
  check(inside.buildingId === null, 'intent: fresh downward intent in doorway exits');
}

const tests = [
  testGravityFallToGround,
  testBuildingFloorLanding,
  testGravityScaleZero,
  testLadderClimbTransitions,
  testLadderHoversWithoutGravity,
  testStairsClimbTransitions,
  testDoorwayTransitions,
  testBuildingSolidOutsideDoorway,
  testXBoundsClamping,
  testRogueLadderEngagementRejected,
  testRogueStairsEngagementRejected,
  testDoorwayMidAirEntryRejected,
  testDoorwayMidAirExitRejected,
  testRightBuildingDoorwayEntryExit,
  testRightBuildingExitViaEntrance,
  testLadderDismountLandsOnFloor,
  testHighVelocityFallNoTunneling,
  testStaleDownwardIntentConsumed,
];

for (const test of tests) {
  test();
}

console.log('---');
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) {
  process.exitCode = 1;
}
