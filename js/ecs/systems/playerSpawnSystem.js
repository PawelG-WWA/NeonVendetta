import {
  Components,
  GameStates,
  ClimbingModes,
  FacingDirs,
  AnimStates,
  createPosition,
  createVelocity,
  createBody,
  createGravity,
  createGrounded,
  createClimbing,
  createInsideBuilding,
  createBoundsConstrained,
  createPlayer,
  createFacing,
  createAnimState,
  createSprite,
  createShooting,
  createWeapon,
  createRenderable,
  createTeam,
  Teams,
} from '../components.js';
import { LAYOUT } from '../../world/layout.js';
import { OUTDOOR_FLOOR_ID } from '../../world/floors.js';

const SPAWN_X = 640;
const BODY_WIDTH = 24;
const BODY_HEIGHT = 40;
const SPRITE_WIDTH = 32;
const SPRITE_HEIGHT = 48;
const SPRITE_Z = 5;
const IDLE_SHEET = 'assets/player_idle.png';
const IDLE_FRAME_COUNT = 6;

const TEAM_QUERY = Object.freeze([Components.Team]);
const PROJECTILE_QUERY = Object.freeze([Components.Projectile]);
const LIFETIME_QUERY = Object.freeze([Components.Lifetime]);

// PlayerSpawnSystem — owns the player entity lifecycle. The player exists only
// while a run is active: spawned when GameState enters PLAYING, destroyed when
// GameState returns to MENU (from PLAYING or GAME_OVER). GAME_OVER keeps the
// player entity so Phase 5 can play the death state on it.
// Entering PLAYING is a FRESH RUN (Phase 7): Score and KillStats reset, and
// every leftover enemy, projectile, and flash entity is destroyed before the
// player spawns.
export function createPlayerSpawnSystem(world) {
  let lastState = null;
  const runEntities = [];

  function getGameState() {
    const gameId = world.queryFirst(Components.GameState);
    return gameId === undefined
      ? null
      : world.getComponent(gameId, Components.GameState);
  }

  function resetRun() {
    const gameId = world.queryFirst(Components.GameState);
    if (gameId !== undefined) {
      const score = world.getComponent(gameId, Components.Score);
      if (score !== undefined) {
        score.value = 0;
      }
      const killStats = world.getComponent(gameId, Components.KillStats);
      if (killStats !== undefined) {
        killStats.kills = 0;
      }
    }
    world.queryInto(TEAM_QUERY, runEntities);
    for (let i = 0; i < runEntities.length; i++) {
      if (world.getComponent(runEntities[i], Components.Team).side === Teams.ENEMY) {
        world.destroyEntity(runEntities[i]);
      }
    }
    world.queryInto(PROJECTILE_QUERY, runEntities);
    for (let i = 0; i < runEntities.length; i++) {
      world.destroyEntity(runEntities[i]);
    }
    world.queryInto(LIFETIME_QUERY, runEntities);
    for (let i = 0; i < runEntities.length; i++) {
      world.destroyEntity(runEntities[i]);
    }
  }

  function spawn() {
    if (world.queryFirst(Components.Player) !== undefined) {
      return;
    }
    const id = world.createEntity();
    world.addComponent(id, Components.Player, createPlayer());
    world.addComponent(id, Components.Position, createPosition(SPAWN_X, LAYOUT.groundY));
    world.addComponent(id, Components.Velocity, createVelocity(0, 0));
    world.addComponent(id, Components.Body, createBody(BODY_WIDTH, BODY_HEIGHT));
    world.addComponent(id, Components.Gravity, createGravity(1));
    world.addComponent(id, Components.Grounded, createGrounded(true, OUTDOOR_FLOOR_ID));
    world.addComponent(id, Components.Climbing, createClimbing(ClimbingModes.NONE));
    world.addComponent(id, Components.InsideBuilding, createInsideBuilding(null, 0));
    world.addComponent(id, Components.BoundsConstrained, createBoundsConstrained());
    world.addComponent(id, Components.Team, createTeam(Teams.PLAYER));
    world.addComponent(id, Components.Facing, createFacing(FacingDirs.RIGHT));
    world.addComponent(id, Components.AnimState, createAnimState(AnimStates.IDLE));
    world.addComponent(
      id,
      Components.Sprite,
      createSprite({
        sheet: IDLE_SHEET,
        frameW: SPRITE_WIDTH,
        frameH: SPRITE_HEIGHT,
        cols: IDLE_FRAME_COUNT,
        rows: 1,
        flipX: false,
      })
    );
    world.addComponent(id, Components.Shooting, createShooting(false));
    world.addComponent(id, Components.Weapon, createWeapon());
    world.addComponent(
      id,
      Components.Renderable,
      createRenderable({
        texturePath: IDLE_SHEET,
        width: SPRITE_WIDTH,
        height: SPRITE_HEIGHT,
        z: SPRITE_Z,
        visible: true,
      })
    );
  }

  function despawn() {
    const id = world.queryFirst(Components.Player);
    if (id !== undefined) {
      world.destroyEntity(id);
    }
  }

  return {
    init() {
      const gameState = getGameState();
      lastState = gameState === null ? null : gameState.current;
      if (lastState === GameStates.PLAYING) {
        resetRun();
        spawn();
      }
    },

    update() {
      const gameState = getGameState();
      if (gameState === null) {
        lastState = null;
        return;
      }
      const current = gameState.current;
      if (current !== lastState) {
        if (current === GameStates.PLAYING) {
          resetRun();
          spawn();
        } else if (current === GameStates.MENU) {
          despawn();
        }
        lastState = current;
      }
    },
  };
}
