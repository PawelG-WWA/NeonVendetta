import { createWorld } from '../js/ecs/world.js';
import {
  Components,
  GameStates,
  ClimbingModes,
  BuildingIds,
  FacingDirs,
  createGameState,
  createInputState,
  createPosition,
  createVelocity,
  createGrounded,
  createClimbing,
  createInsideBuilding,
  createPlayer,
  createFacing,
  createShooting,
  createWeapon,
  createCooldown,
  createHitFlash,
  createDead,
} from '../js/ecs/components.js';
import { createWeaponSystem } from '../js/ecs/systems/weaponSystem.js';
import { createLifetimeSystem } from '../js/ecs/systems/lifetimeSystem.js';
import { createPlayerControllerSystem } from '../js/ecs/systems/playerControllerSystem.js';
import { deriveTint, TINT_HIT_FLASH, TINT_COOLDOWN, TINT_DEFAULT } from '../js/ecs/tint.js';
import { LAYOUT } from '../js/world/layout.js';

const DT = 1 / 60;
const GROUND_Y = LAYOUT.groundY;
const GRAY = TINT_COOLDOWN;
const WHITE = TINT_DEFAULT;
const RED = TINT_HIT_FLASH;

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

function approx(actual, expected, epsilon = 1e-9) {
  return Math.abs(actual - expected) <= epsilon;
}

function makeRig() {
  const world = createWorld();
  const gameEntity = world.createEntity();
  world.addComponent(gameEntity, Components.GameState, createGameState(GameStates.PLAYING));

  const weaponSystem = createWeaponSystem(world);
  const lifetimeSystem = createLifetimeSystem(world);

  function step(count = 1) {
    for (let i = 0; i < count; i++) {
      weaponSystem.update(DT);
      lifetimeSystem.update(DT);
    }
  }

  function bulletCount() {
    return world.query(Components.Projectile).length;
  }

  return { world, step, bulletCount };
}

function addPlayer(rig, {
  x = 640,
  y = GROUND_Y,
  buildingId = null,
  floor = 0,
  climbingMode = ClimbingModes.NONE,
  facingDir = FacingDirs.RIGHT,
  shooting = true,
}) {
  const world = rig.world;
  const id = world.createEntity();
  world.addComponent(id, Components.Player, createPlayer());
  world.addComponent(id, Components.Position, createPosition(x, y));
  world.addComponent(id, Components.Climbing, createClimbing(climbingMode));
  world.addComponent(id, Components.InsideBuilding, createInsideBuilding(buildingId, floor));
  world.addComponent(id, Components.Facing, createFacing(facingDir));
  world.addComponent(id, Components.Shooting, createShooting(shooting));
  world.addComponent(id, Components.Weapon, createWeapon());
  return id;
}

function testFireRateExactlyThreePerSecond() {
  const rig = makeRig();
  addPlayer(rig, {});
  rig.step(60);
  check(rig.bulletCount() === 3, 'rate: exactly 3 bullets after 1s of held trigger (3 rps)');
  const bulletId = rig.world.query(Components.Projectile)[0];
  const projectile = rig.world.getComponent(bulletId, Components.Projectile);
  check(
    projectile.dx === 1 && projectile.dy === 0 && projectile.speed === 480 && projectile.damage === 1,
    'rate: bullet flies in facing direction at 480 px/s with damage 1'
  );
}

function testOverheatForcesCooldownThenResumes() {
  const rig = makeRig();
  const playerId = addPlayer(rig, {});
  const weapon = rig.world.getComponent(playerId, Components.Weapon);

  rig.step(60);
  check(rig.bulletCount() === 3, 'overheat: 3 shots in the 1s burst window');
  check(weapon.heat >= 1 - 1e-9, 'overheat: heat reached the 1.0s burst window');
  check(rig.world.hasComponent(playerId, Components.Cooldown), 'overheat: Cooldown debuff applied');
  const cooldown = rig.world.getComponent(playerId, Components.Cooldown);
  check(approx(cooldown.timer, 0.5), 'overheat: debuff timer starts at the 0.5s cooldown');

  rig.step(10);
  check(rig.bulletCount() === 3, 'overheat: silence during forced cooldown');
  check(approx(cooldown.timer, 0.5 - 10 / 60), 'overheat: debuff timer counts down');

  rig.step(19);
  check(rig.world.hasComponent(playerId, Components.Cooldown), 'overheat: debuff still active before 500ms elapse');

  rig.step(1);
  check(!rig.world.hasComponent(playerId, Components.Cooldown), 'overheat: debuff removed after exactly 500ms');
  check(weapon.heat === 0, 'overheat: heat resets when cooldown completes');
  check(rig.bulletCount() === 3, 'overheat: no shot on the tick cooldown completes');

  rig.step(1);
  check(rig.bulletCount() === 4, 'overheat: firing resumes immediately after cooldown');
  rig.step(20);
  check(rig.bulletCount() === 5, 'overheat: second burst cycles at 3 rps');
}

function testOverheatGateEvaluatedBeforeFiring() {
  const rig = makeRig();
  const playerId = addPlayer(rig, {});
  const weapon = rig.world.getComponent(playerId, Components.Weapon);
  const shooting = rig.world.getComponent(playerId, Components.Shooting);

  rig.step(59);
  check(rig.bulletCount() === 3, 'exploit: 3 shots after 59/60s held');
  check(approx(weapon.heat, 59 / 60), 'exploit: heat parked just below the burst window');

  shooting.active = false;
  rig.step(30);
  check(rig.bulletCount() === 3, 'exploit: trigger released, heat kept');

  shooting.active = true;
  rig.step(1);
  check(rig.world.hasComponent(playerId, Components.Cooldown), 'exploit: overheat starts on the re-press tick');
  check(rig.bulletCount() === 3, 'exploit: no free 4th shot on the same tick overheat starts');
  check(rig.world.query(Components.Lifetime).length === 0, 'exploit: no muzzle flash for the blocked shot');
}

function testTintDerivedFromComponentState() {
  const rig = makeRig();
  const playerId = addPlayer(rig, {});
  const world = rig.world;

  check(deriveTint(world, playerId) === WHITE, 'tint: neither HitFlash nor Cooldown -> white');

  world.addComponent(playerId, Components.Cooldown, createCooldown(0.5));
  check(deriveTint(world, playerId) === GRAY, 'tint: entity with Cooldown -> gray');

  world.addComponent(playerId, Components.HitFlash, createHitFlash(0.12));
  check(deriveTint(world, playerId) === RED, 'tint: HitFlash + Cooldown -> red wins (documented priority)');

  world.removeComponent(playerId, Components.HitFlash);
  check(deriveTint(world, playerId) === GRAY, 'tint: HitFlash expired, Cooldown remains -> gray again');

  world.removeComponent(playerId, Components.Cooldown);
  check(deriveTint(world, playerId) === WHITE, 'tint: Cooldown expired -> white restored');
}

function testTintFollowsWeaponOverheatLifecycle() {
  const rig = makeRig();
  const playerId = addPlayer(rig, {});
  rig.step(60);
  check(deriveTint(rig.world, playerId) === GRAY, 'tint: gray while overheated');
  rig.step(30);
  check(deriveTint(rig.world, playerId) === WHITE, 'tint: white restored when the cooldown completes');
}

function testNoFiringWhileDead() {
  const rig = makeRig();
  const playerId = addPlayer(rig, {});
  rig.world.addComponent(playerId, Components.Dead, createDead(1.2));
  rig.step(30);
  check(rig.bulletCount() === 0, 'dead: no bullets fired while player is dying');
  check(rig.world.query(Components.Lifetime).length === 0, 'dead: no muzzle flash while dying');
}

function testLadderFiringRules() {
  const rig = makeRig();
  const playerId = addPlayer(rig, {
    x: 1040,
    buildingId: BuildingIds.RIGHT,
    floor: 1,
    climbingMode: ClimbingModes.LADDER,
    facingDir: FacingDirs.LEFT,
  });
  const weapon = rig.world.getComponent(playerId, Components.Weapon);

  rig.step(30);
  check(rig.bulletCount() === 0, 'ladder: horizontal fire blocked while climbing');
  check(weapon.heat === 0, 'ladder: blocked horizontal fire builds no heat');

  const facing = rig.world.getComponent(playerId, Components.Facing);
  facing.dir = FacingDirs.UP;
  rig.step(1);
  check(rig.bulletCount() === 1, 'ladder: firing up while climbing works');

  facing.dir = FacingDirs.DOWN;
  rig.step(20);
  check(rig.bulletCount() === 2, 'ladder: firing down while climbing works');

  facing.dir = FacingDirs.RIGHT;
  rig.step(30);
  check(rig.bulletCount() === 2, 'ladder: horizontal fire blocked both directions');
}

function testLadderFireThroughControllerIntegration() {
  const world = createWorld();
  const gameEntity = world.createEntity();
  world.addComponent(gameEntity, Components.GameState, createGameState(GameStates.PLAYING));
  const inputEntity = world.createEntity();
  world.addComponent(inputEntity, Components.InputState, createInputState());
  const input = world.getComponent(inputEntity, Components.InputState);

  const controllerSystem = createPlayerControllerSystem(world);
  const weaponSystem = createWeaponSystem(world);

  const playerId = world.createEntity();
  world.addComponent(playerId, Components.Player, createPlayer());
  world.addComponent(
    playerId,
    Components.Position,
    createPosition(1040, LAYOUT.buildings.right.floors[1].y)
  );
  world.addComponent(playerId, Components.Velocity, createVelocity(0, 0));
  world.addComponent(playerId, Components.Grounded, createGrounded(false, null));
  world.addComponent(playerId, Components.Climbing, createClimbing(ClimbingModes.LADDER));
  world.addComponent(
    playerId,
    Components.InsideBuilding,
    createInsideBuilding(BuildingIds.RIGHT, 1)
  );
  world.addComponent(playerId, Components.Facing, createFacing(FacingDirs.UP));
  world.addComponent(playerId, Components.Shooting, createShooting(false));
  world.addComponent(playerId, Components.Weapon, createWeapon());
  const weapon = world.getComponent(playerId, Components.Weapon);

  function step(count = 1) {
    for (let i = 0; i < count; i++) {
      controllerSystem.update(DT);
      weaponSystem.update(DT);
      input.justPressed.clear();
      input.justReleased.clear();
    }
  }

  function bulletCount() {
    return world.query(Components.Projectile).length;
  }

  input.pressed.add('ArrowUp');
  step(1);
  check(bulletCount() === 1, 'ladder-e2e: ArrowUp fires through playerControllerSystem -> weaponSystem on a ladder');
  const bulletId = world.query(Components.Projectile)[0];
  const projectile = world.getComponent(bulletId, Components.Projectile);
  check(projectile.dx === 0 && projectile.dy === 1, 'ladder-e2e: the bullet flies straight up');

  input.pressed.delete('ArrowUp');
  input.pressed.add('ArrowLeft');
  step(30);
  check(bulletCount() === 1, 'ladder-e2e: ArrowLeft held on a ladder fires nothing');
  check(approx(weapon.heat, DT), 'ladder-e2e: blocked horizontal fire builds no heat beyond the up shot');
  check(
    world.getComponent(playerId, Components.Climbing).mode === ClimbingModes.LADDER,
    'ladder-e2e: aiming left does not dismount the ladder'
  );
}

function testMuzzleFlashLifecycle() {
  const rig = makeRig();
  addPlayer(rig, {});
  rig.step(1);

  const flashes = rig.world.query(Components.Lifetime);
  check(flashes.length === 1, 'flash: muzzle flash entity spawned on shot');
  const flashId = flashes[0];
  const sprite = rig.world.getComponent(flashId, Components.Sprite);
  const renderable = rig.world.getComponent(flashId, Components.Renderable);
  check(
    sprite.sheet === 'assets/muzzle_flash.png' && sprite.cols === 4 && sprite.rows === 1,
    'flash: muzzle_flash.png bound as 4x1 sheet'
  );
  check(
    renderable.width === 24 && renderable.height === 24 && renderable.z === 7,
    'flash: 24x24 quad at z=7'
  );
  check(renderable.x === 640 + 24 - 12 && renderable.y === GROUND_Y + 20 - 12, 'flash: quad centered on the muzzle');

  rig.step(2);
  const anim = rig.world.getComponent(flashId, Components.AnimState);
  check(anim.frame === 2, 'flash: frame cursor tracks elapsed lifetime (one pass)');

  rig.step(2);
  check(!rig.world.hasComponent(flashId, Components.Lifetime), 'flash: self-destructs after ~80ms');
}

function testIndoorShotEffectsBehindFacadeMask() {
  const rig = makeRig();
  addPlayer(rig, { buildingId: BuildingIds.LEFT, floor: 0 });
  rig.step(1);

  const flashes = rig.world.query(Components.Lifetime);
  check(flashes.length === 1, 'flash-indoor: muzzle flash spawned for an indoor shot');
  check(
    rig.world.getComponent(flashes[0], Components.Renderable).z === 3.5,
    'flash-indoor: indoor muzzle flash inherits the shooter context (z=3.5, behind the facade mask)'
  );
  const bulletId = rig.world.query(Components.Projectile)[0];
  check(
    rig.world.getComponent(bulletId, Components.Renderable).z === 3.5,
    'flash-indoor: indoor bullet renders behind the facade mask (z=3.5)'
  );
}

function testMuzzleOffsetsPerFacing() {
  const rightRig = makeRig();
  addPlayer(rightRig, { facingDir: FacingDirs.RIGHT });
  rightRig.step(1);
  let position = rightRig.world.getComponent(rightRig.world.query(Components.Projectile)[0], Components.Position);
  check(position.x === 640 + 24 && position.y === GROUND_Y + 20, 'muzzle: right fires from body mid-right');

  const leftRig = makeRig();
  addPlayer(leftRig, { facingDir: FacingDirs.LEFT });
  leftRig.step(1);
  position = leftRig.world.getComponent(leftRig.world.query(Components.Projectile)[0], Components.Position);
  check(position.x === 640 - 24 && position.y === GROUND_Y + 20, 'muzzle: left fires from body mid-left');

  const upRig = makeRig();
  addPlayer(upRig, { facingDir: FacingDirs.UP });
  upRig.step(1);
  position = upRig.world.getComponent(upRig.world.query(Components.Projectile)[0], Components.Position);
  check(position.x === 640 && position.y === GROUND_Y + 44, 'muzzle: up fires from body top');

  const downRig = makeRig();
  addPlayer(downRig, { facingDir: FacingDirs.DOWN });
  downRig.step(1);
  position = downRig.world.getComponent(downRig.world.query(Components.Projectile)[0], Components.Position);
  check(position.x === 640 && position.y === GROUND_Y - 4, 'muzzle: down fires from body mid downward');
}

function testMuzzleFlashClampedToZoneBounds() {
  const leftWallRig = makeRig();
  addPlayer(leftWallRig, {
    x: 20,
    y: LAYOUT.buildings.left.floors[0].y,
    buildingId: BuildingIds.LEFT,
    floor: 0,
    facingDir: FacingDirs.LEFT,
  });
  leftWallRig.step(1);
  let flashId = leftWallRig.world.query(Components.Lifetime)[0];
  let renderable = leftWallRig.world.getComponent(flashId, Components.Renderable);
  check(
    renderable.x === LAYOUT.buildings.left.minX,
    'flash: spawn x clamped out of the left wall (quad fully inside the zone)'
  );

  const rightWallRig = makeRig();
  addPlayer(rightWallRig, {
    x: 724,
    y: LAYOUT.buildings.left.floors[0].y,
    buildingId: BuildingIds.LEFT,
    floor: 0,
    facingDir: FacingDirs.RIGHT,
  });
  rightWallRig.step(1);
  flashId = rightWallRig.world.query(Components.Lifetime)[0];
  renderable = rightWallRig.world.getComponent(flashId, Components.Renderable);
  check(
    renderable.x === LAYOUT.buildings.left.maxX - 24,
    'flash: spawn x clamped out of the right wall (quad fully inside the zone)'
  );
}

function testBulletCarriesPlayerZoneContext() {
  const indoorRig = makeRig();
  addPlayer(indoorRig, {
    x: 300,
    y: LAYOUT.buildings.left.floors[0].y,
    buildingId: BuildingIds.LEFT,
    floor: 0,
  });
  indoorRig.step(1);
  const indoorBulletId = indoorRig.world.query(Components.Projectile)[0];
  const indoorContext = indoorRig.world.getComponent(indoorBulletId, Components.Projectile).context;
  check(
    indoorContext !== null && indoorContext.buildingId === BuildingIds.LEFT && indoorContext.floor === 0,
    'context: indoor bullet carries the player zone context'
  );

  const outdoorRig = makeRig();
  addPlayer(outdoorRig, {});
  outdoorRig.step(1);
  const outdoorBulletId = outdoorRig.world.query(Components.Projectile)[0];
  const outdoorContext = outdoorRig.world.getComponent(outdoorBulletId, Components.Projectile).context;
  check(
    outdoorContext !== null && outdoorContext.buildingId === null && outdoorContext.floor === 0,
    'context: outdoor bullet carries the outdoor zone context'
  );
}

function testHeatKeptOnTriggerRelease() {
  const rig = makeRig();
  const playerId = addPlayer(rig, {});
  const weapon = rig.world.getComponent(playerId, Components.Weapon);
  const shooting = rig.world.getComponent(playerId, Components.Shooting);

  rig.step(30);
  check(rig.bulletCount() === 2, 'feather: 2 shots after 0.5s held');
  const heatAtRelease = weapon.heat;
  check(approx(heatAtRelease, 0.5), 'feather: heat exactly 0.5 after half a burst');

  shooting.active = false;
  rig.step(30);
  check(rig.bulletCount() === 2, 'feather: no shots while trigger released');
  check(weapon.heat === heatAtRelease, 'feather: releasing pauses heating but keeps the heat');

  shooting.active = true;
  rig.step(1);
  check(rig.bulletCount() === 3, 'feather: re-press fires immediately (shot interval long past)');
}

function testCooldownRestoredOnDeathMidCooldown() {
  const rig = makeRig();
  const playerId = addPlayer(rig, {});
  rig.step(60);
  check(rig.world.hasComponent(playerId, Components.Cooldown), 'mid-death: overheated before dying');
  check(deriveTint(rig.world, playerId) === GRAY, 'mid-death: gray tint derived before dying');

  rig.world.removeComponent(playerId, Components.Weapon);
  rig.world.removeComponent(playerId, Components.Shooting);
  rig.world.addComponent(playerId, Components.Dead, createDead(1.2));
  rig.step(1);
  check(!rig.world.hasComponent(playerId, Components.Cooldown), 'mid-death: Cooldown debuff stripped when weapon is lost');
  check(deriveTint(rig.world, playerId) === WHITE, 'mid-death: tint derived white even though cooldown never completed');
}

const tests = [
  testFireRateExactlyThreePerSecond,
  testOverheatForcesCooldownThenResumes,
  testOverheatGateEvaluatedBeforeFiring,
  testTintDerivedFromComponentState,
  testTintFollowsWeaponOverheatLifecycle,
  testNoFiringWhileDead,
  testLadderFiringRules,
  testLadderFireThroughControllerIntegration,
  testMuzzleFlashLifecycle,
  testIndoorShotEffectsBehindFacadeMask,
  testMuzzleOffsetsPerFacing,
  testMuzzleFlashClampedToZoneBounds,
  testBulletCarriesPlayerZoneContext,
  testHeatKeptOnTriggerRelease,
  testCooldownRestoredOnDeathMidCooldown,
];

for (const test of tests) {
  test();
}

console.log('---');
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) {
  process.exitCode = 1;
}
