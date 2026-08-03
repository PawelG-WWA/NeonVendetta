import { Components, GameStates, BuildingIds, EnemyAIStates } from '../components.js';
import { ENEMY_DEFS, EnemyTypes, createEnemy } from '../factories.js';
import { LAYOUT, GAME_WIDTH } from '../../world/layout.js';
import { getFloorId } from '../../world/floors.js';

const BUILDING_IDS_ORDER = Object.freeze([BuildingIds.LEFT, BuildingIds.RIGHT]);

export const PRACTICE_INTERVAL = 1.5;
export const PRACTICE_PAIR_KILLS = 5;
export const PRACTICE_END_KILLS = 10;
export const WAVE_INTERVAL = 4;
export const MAX_ACTIVE_ENEMIES = 10;
export const VANISH_MARGIN = 48;
export const REPLACE_DELAY = 2;
export const SPAWN_OFFSET = 40;
export const INDOOR_SPAWN_CHANCE = 0.5;

const TIME_EPSILON = 1e-9;

const TYPE_COSTS = Object.freeze({
  [EnemyTypes.SIMPLE]: 1,
  [EnemyTypes.MEDIUM]: 3,
  [EnemyTypes.TOUGH]: 5,
});

const ENEMY_QUERY = Object.freeze([Components.Enemy]);
const VANISH_QUERY = Object.freeze([
  Components.Enemy,
  Components.EnemyAI,
  Components.Position,
]);

// computeWaveBudget — post-practice wave budget: 3 at 10 kills, +1 per 4
// kills after that, capped at 12.
export function computeWaveBudget(kills) {
  return Math.min(3 + Math.floor((kills - PRACTICE_END_KILLS) / 4), 12);
}

// composeWave — pure wave composition. Rules:
//   - tough enemies in the wave never push total toughs past 30% of the
//     ACTIVE enemy count (counted before the wave).
//   - budget >= 8 considers one tough (cap permitting); budget >= 5 always
//     includes at least one medium or tough (mixed-wave preference).
//   - mediums stay <= 50% of the FINAL wave: the candidate counts toward
//     both sides of the check before it is pushed. The lone exception is a
//     slot-starved wave (slots too small to balance the mixed-wave medium).
//   - the wave never exceeds `slots` (active-cap headroom).
export function composeWave(budget, activeCount, activeToughs, slots) {
  const wave = [];
  let remaining = budget;
  let toughCap = Math.floor(activeCount * 0.3) - activeToughs;
  if (toughCap < 0) {
    toughCap = 0;
  }
  let mediums = 0;

  if (remaining >= 8 && toughCap > 0 && wave.length < slots) {
    wave.push(EnemyTypes.TOUGH);
    remaining -= TYPE_COSTS[EnemyTypes.TOUGH];
    toughCap -= 1;
  }
  if (
    remaining >= TYPE_COSTS[EnemyTypes.MEDIUM] &&
    budget >= 5 &&
    wave.length === 0 &&
    wave.length < slots
  ) {
    wave.push(EnemyTypes.MEDIUM);
    remaining -= TYPE_COSTS[EnemyTypes.MEDIUM];
    mediums += 1;
  }
  while (remaining >= 1 && wave.length < slots) {
    if (remaining >= TYPE_COSTS[EnemyTypes.MEDIUM] && (mediums + 1) * 2 <= wave.length + 1) {
      wave.push(EnemyTypes.MEDIUM);
      remaining -= TYPE_COSTS[EnemyTypes.MEDIUM];
      mediums += 1;
    } else {
      wave.push(EnemyTypes.SIMPLE);
      remaining -= TYPE_COSTS[EnemyTypes.SIMPLE];
    }
  }
  return wave;
}

// SpawnSystem — Phase 7 difficulty director. Practice period (kills < 10):
// one simple enemy every ~1.5s (not kill-gated); from 5 kills the batch
// becomes a pair. Post-practice: a budget wave every ~4s (see computeWaveBudget
// / composeWave). Active enemies are hard-capped at MAX_ACTIVE_ENEMIES.
//
// Spawn points: off-screen road edges (walk-ins — BoundsConstrained stripped
// so boundsSystem doesn't teleport them into view; enemyAISystem restores it)
// or a random building floor that is NOT the player's current building+floor.
//
// Vanish replacement: a fleeing enemy past the scene x-edge is destroyed here
// (no score) and a same-type replacement spawns REPLACE_DELAY seconds later.
//
// `random` is injectable for deterministic tests.
export function createSpawnSystem(world, { random = Math.random } = {}) {
  const enemies = [];
  const vanishing = [];
  const replacements = [];
  const activeInfo = { count: 0, toughs: 0 };
  const spawnSpot = { buildingId: null, floor: 0, x: 0, y: 0 };
  let lastState = null;
  let practiceTimer = 0;
  let waveTimer = WAVE_INTERVAL;

  function getGameState() {
    const gameId = world.queryFirst(Components.GameState);
    return gameId === undefined
      ? null
      : world.getComponent(gameId, Components.GameState);
  }

  function getKills() {
    const statsId = world.queryFirst(Components.KillStats);
    return statsId === undefined
      ? 0
      : world.getComponent(statsId, Components.KillStats).kills;
  }

  function countActives() {
    world.queryInto(ENEMY_QUERY, enemies);
    activeInfo.count = 0;
    activeInfo.toughs = 0;
    for (let i = 0; i < enemies.length; i++) {
      const id = enemies[i];
      if (world.hasComponent(id, Components.Dead)) {
        continue;
      }
      activeInfo.count += 1;
      if (world.getComponent(id, Components.Enemy).type === EnemyTypes.TOUGH) {
        activeInfo.toughs += 1;
      }
    }
    return activeInfo;
  }

  function spawnOutdoor(type) {
    const side = random() < 0.5 ? -1 : 1;
    const x = side < 0 ? -SPAWN_OFFSET : GAME_WIDTH + SPAWN_OFFSET;
    const id = createEnemy(world, type, x, LAYOUT.groundY);
    world.removeComponent(id, Components.BoundsConstrained);
    const grounded = world.getComponent(id, Components.Grounded);
    grounded.value = true;
    grounded.floorId = getFloorId(world.getComponent(id, Components.InsideBuilding));
    return id;
  }

  function pickIndoorSpot(type, playerInside) {
    const excludedBuilding = playerInside !== null ? playerInside.buildingId : null;
    const excludedFloor = playerInside !== null ? playerInside.floor : -1;
    let total = 0;
    for (const buildingId of BUILDING_IDS_ORDER) {
      total += LAYOUT.buildings[buildingId].floors.length;
    }
    const available = excludedBuilding === null ? total : total - 1;
    let index = Math.floor(random() * available);
    if (index >= available) {
      index = available - 1;
    }
    for (const buildingId of BUILDING_IDS_ORDER) {
      const floors = LAYOUT.buildings[buildingId].floors;
      for (let floor = 0; floor < floors.length; floor++) {
        if (buildingId === excludedBuilding && floor === excludedFloor) {
          continue;
        }
        if (index > 0) {
          index -= 1;
          continue;
        }
        const building = LAYOUT.buildings[buildingId];
        const margin = ENEMY_DEFS[type].bodyWidth / 2 + 4;
        const span = building.maxX - building.minX - margin * 2;
        spawnSpot.buildingId = buildingId;
        spawnSpot.floor = floor;
        spawnSpot.x = building.minX + margin + random() * span;
        spawnSpot.y = floors[floor].y;
        return spawnSpot;
      }
    }
    return null;
  }

  function spawnOne(type) {
    // A dead player is mid-corpse-window: beginDeath stripped its
    // InsideBuilding, so read it only while alive and treat anything else as
    // "no exclusion" (null) — never crash the director on a corpse.
    const playerId = world.queryFirst(Components.Player);
    const playerInside =
      playerId !== undefined && !world.hasComponent(playerId, Components.Dead)
        ? world.getComponent(playerId, Components.InsideBuilding) ?? null
        : null;
    const indoor = random() < INDOOR_SPAWN_CHANCE;
    if (!indoor) {
      return spawnOutdoor(type);
    }
    const spot = pickIndoorSpot(type, playerInside);
    if (spot === null) {
      return spawnOutdoor(type);
    }
    const id = createEnemy(world, type, spot.x, spot.y);
    const inside = world.getComponent(id, Components.InsideBuilding);
    inside.buildingId = spot.buildingId;
    inside.floor = spot.floor;
    const grounded = world.getComponent(id, Components.Grounded);
    grounded.value = true;
    grounded.floorId = getFloorId(inside);
    return id;
  }

  function resetRun() {
    practiceTimer = 0;
    waveTimer = WAVE_INTERVAL;
    replacements.length = 0;
  }

  return {
    update(dt) {
      const gameState = getGameState();
      if (gameState === null) {
        lastState = null;
        return;
      }
      if (gameState.current !== lastState) {
        lastState = gameState.current;
        if (lastState === GameStates.PLAYING) {
          resetRun();
        }
      }
      if (lastState !== GameStates.PLAYING) {
        return;
      }

      // Vanish sweep: fleeing enemies fully past the scene edge are
      // destroyed without score and queue a same-type replacement.
      world.queryInto(VANISH_QUERY, vanishing);
      for (let i = 0; i < vanishing.length; i++) {
        const id = vanishing[i];
        const ai = world.getComponent(id, Components.EnemyAI);
        if (ai.state !== EnemyAIStates.FLEE || world.hasComponent(id, Components.Dead)) {
          continue;
        }
        const position = world.getComponent(id, Components.Position);
        if (position.x < -VANISH_MARGIN || position.x > GAME_WIDTH + VANISH_MARGIN) {
          replacements.push({
            type: world.getComponent(id, Components.Enemy).type,
            timer: REPLACE_DELAY,
          });
          world.destroyEntity(id);
        }
      }

      for (let i = replacements.length - 1; i >= 0; i--) {
        replacements[i].timer -= dt;
        if (replacements[i].timer <= TIME_EPSILON) {
          const type = replacements[i].type;
          replacements.splice(i, 1);
          if (countActives().count < MAX_ACTIVE_ENEMIES) {
            spawnOutdoor(type);
          }
        }
      }

      const kills = getKills();
      const actives = countActives();

      if (kills < PRACTICE_END_KILLS) {
        practiceTimer -= dt;
        if (practiceTimer <= TIME_EPSILON) {
          practiceTimer = PRACTICE_INTERVAL;
          const batch = kills < PRACTICE_PAIR_KILLS ? 1 : 2;
          for (let i = 0; i < batch && actives.count < MAX_ACTIVE_ENEMIES; i++) {
            spawnOne(EnemyTypes.SIMPLE);
            actives.count += 1;
          }
        }
        return;
      }

      waveTimer -= dt;
      if (waveTimer <= TIME_EPSILON) {
        waveTimer = WAVE_INTERVAL;
        const slots = MAX_ACTIVE_ENEMIES - actives.count;
        if (slots > 0) {
          const wave = composeWave(computeWaveBudget(kills), actives.count, actives.toughs, slots);
          for (let i = 0; i < wave.length; i++) {
            spawnOne(wave[i]);
          }
        }
      }
    }
  };
}

