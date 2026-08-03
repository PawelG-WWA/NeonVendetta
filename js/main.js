import { createWorld } from './ecs/world.js';
import {
  Components,
  createGameState,
  createBestScore,
  createInputState,
  createScore,
  createMusicTrack,
  createKillStats,
} from './ecs/components.js';
import { createInputSystem } from './ecs/systems/inputSystem.js';
import { createGameStateSystem } from './ecs/systems/gameStateSystem.js';
import { createPlayerSpawnSystem } from './ecs/systems/playerSpawnSystem.js';
import { createSpawnSystem } from './ecs/systems/spawnSystem.js';
import { createEnemyAISystem } from './ecs/systems/enemyAISystem.js';
import { createPlayerControllerSystem } from './ecs/systems/playerControllerSystem.js';
import { createWeaponSystem } from './ecs/systems/weaponSystem.js';
import { createPhysicsSystem } from './ecs/systems/physicsSystem.js';
import { createClimbSystem } from './ecs/systems/climbSystem.js';
import { createBoundsSystem } from './ecs/systems/boundsSystem.js';
import { createCollisionSystem } from './ecs/systems/collisionSystem.js';
import { createDamageSystem } from './ecs/systems/damageSystem.js';
import { createDeathAnimSystem } from './ecs/systems/deathAnimSystem.js';
import { createProjectileSystem } from './ecs/systems/projectileSystem.js';
import { createLifetimeSystem } from './ecs/systems/lifetimeSystem.js';
import { createHitFlashSystem } from './ecs/systems/hitFlashSystem.js';
import { createAnimationSystem } from './ecs/systems/animationSystem.js';
import { createUISystem } from './ecs/systems/uiSystem.js';
import { createRenderSystem } from './ecs/systems/renderSystem.js';
import { createAudioSystem } from './ecs/systems/audioSystem.js';
import { createHudSystem } from './ecs/systems/hudSystem.js';

const FIXED_TIMESTEP = 1 / 60;
const MAX_FRAME_TIME = 0.25;

// Loop-level error logging is rate-limited: a system throwing every tick
// would otherwise flood the console 60x/s and stall the tab. At most
// ERROR_LOG_LIMIT errors per rolling second are printed; the rest are
// counted and reported as a single summary line on the next window.
const ERROR_LOG_LIMIT = 5;
let errorWindowStart = -1000;
let errorLogged = 0;
let errorSuppressed = 0;

function logThrottled(message, error) {
  const now = performance.now();
  if (now - errorWindowStart >= 1000) {
    if (errorSuppressed > 0) {
      console.error('[main] ' + errorSuppressed + ' further error(s) suppressed in the last second');
      errorSuppressed = 0;
    }
    errorWindowStart = now;
    errorLogged = 0;
  }
  if (errorLogged < ERROR_LOG_LIMIT) {
    errorLogged += 1;
    console.error(message, error);
  } else {
    errorSuppressed += 1;
  }
}

function boot() {
  const world = createWorld();

  const gameEntity = world.createEntity();
  world.addComponent(gameEntity, Components.GameState, createGameState());
  world.addComponent(gameEntity, Components.BestScore, createBestScore());
  world.addComponent(gameEntity, Components.Score, createScore());
  world.addComponent(gameEntity, Components.KillStats, createKillStats());

  const inputEntity = world.createEntity();
  world.addComponent(inputEntity, Components.InputState, createInputState());

  const musicEntity = world.createEntity();
  world.addComponent(
    musicEntity,
    Components.MusicTrack,
    createMusicTrack('assets/music.ogg', { loop: true, volume: 0.6 })
  );

  const gameRoot = document.getElementById('game-root');
  const uiRoot = document.getElementById('ui-root');

  const inputSystem = createInputSystem(world);
  const gameStateSystem = createGameStateSystem(world);
  const playerSpawnSystem = createPlayerSpawnSystem(world);
  const spawnSystem = createSpawnSystem(world);
  const enemyAISystem = createEnemyAISystem(world);
  const playerControllerSystem = createPlayerControllerSystem(world);
  const physicsSystem = createPhysicsSystem(world);
  const climbSystem = createClimbSystem(world);
  const boundsSystem = createBoundsSystem(world);
  const collisionSystem = createCollisionSystem(world);
  const damageSystem = createDamageSystem(world, collisionSystem);
  const deathAnimSystem = createDeathAnimSystem(world);
  const projectileSystem = createProjectileSystem(world);
  const lifetimeSystem = createLifetimeSystem(world);
  const renderSystem = createRenderSystem(world, gameRoot);
  const weaponSystem = createWeaponSystem(world);
  const hitFlashSystem = createHitFlashSystem(world);
  const animationSystem = createAnimationSystem(world);
  const uiSystem = createUISystem(world, uiRoot);
  const audioSystem = createAudioSystem(world);
  const hudSystem = createHudSystem(world, uiRoot);

  // Update order contract: spawnSystem and enemyAISystem sit between
  // playerSpawnSystem (fresh-run wipe) and physics — AI writes Velocity /
  // Climbing like the controller, so doorway/stairs/ladder mechanisms resolve
  // identically for player and enemies. weaponSystem sits immediately after
  // playerControllerSystem (Shooting.active / Facing are freshest there) and
  // before physicsSystem, so bullets spawn from the position the aim was made
  // at. lifetimeSystem runs after projectileSystem, alongside the other
  // entity-cleanup passes.
  const updateSystems = [
    inputSystem,
    gameStateSystem,
    playerSpawnSystem,
    spawnSystem,
    playerControllerSystem,
    enemyAISystem,
    weaponSystem,
    physicsSystem,
    climbSystem,
    boundsSystem,
    collisionSystem,
    deathAnimSystem,
    damageSystem,
    projectileSystem,
    lifetimeSystem,
    hitFlashSystem,
    animationSystem,
    uiSystem,
    audioSystem,
    hudSystem,
  ];
  const systems = [...updateSystems, renderSystem];

  for (const system of systems) {
    if (typeof system.init === 'function') {
      system.init();
    }
  }

  let lastTime = performance.now();
  let accumulator = 0;

  function frame(now) {
    const frameTime = Math.min((now - lastTime) / 1000, MAX_FRAME_TIME);
    lastTime = now;
    accumulator += frameTime;

    // Loop-level safety: no single system exception may ever kill the rAF
    // chain — log it and keep the game running.
    while (accumulator >= FIXED_TIMESTEP) {
      try {
        for (const system of updateSystems) {
          system.update(FIXED_TIMESTEP);
        }
        inputSystem.postUpdate();
      } catch (error) {
        logThrottled('[main] system update failed; frame skipped:', error);
      }
      accumulator -= FIXED_TIMESTEP;
    }

    try {
      renderSystem.update();
    } catch (error) {
      logThrottled('[main] render failed:', error);
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
