export const Components = Object.freeze({
  GameState: 'GameState',
  BestScore: 'BestScore',
  InputState: 'InputState',
  Renderable: 'Renderable',
  Score: 'Score',
  MusicTrack: 'MusicTrack',
  Position: 'Position',
  Velocity: 'Velocity',
  Body: 'Body',
  Gravity: 'Gravity',
  Grounded: 'Grounded',
  Climbing: 'Climbing',
  InsideBuilding: 'InsideBuilding',
  BoundsConstrained: 'BoundsConstrained',
  Player: 'Player',
  Facing: 'Facing',
  AnimState: 'AnimState',
  Sprite: 'Sprite',
  Shooting: 'Shooting',
  Weapon: 'Weapon',
  Team: 'Team',
  Health: 'Health',
  HitFlash: 'HitFlash',
  Dead: 'Dead',
  Projectile: 'Projectile',
  Cooldown: 'Cooldown',
  Lifetime: 'Lifetime',
  Enemy: 'Enemy',
  EnemyAI: 'EnemyAI',
  Attacking: 'Attacking',
  KillStats: 'KillStats',
});

export const GameStates = Object.freeze({
  MENU: 'MENU',
  PLAYING: 'PLAYING',
  GAME_OVER: 'GAME_OVER',
});

export function createGameState(initial = GameStates.MENU) {
  return {
    current: initial,
    previous: null,
    request: null,
  };
}

export function createBestScore(value = 0) {
  return { value };
}

export function createInputState() {
  return {
    pressed: new Set(),
    justPressed: new Set(),
    justReleased: new Set(),
  };
}

export function createRenderable({
  texturePath,
  width,
  height,
  x = 0,
  y = 0,
  z = 0,
  visible = true,
}) {
  return {
    texturePath,
    width,
    height,
    x,
    y,
    z,
    visible,
    dirty: true,
  };
}

export function createScore(value = 0) {
  return { value };
}

export function createMusicTrack(src, { loop = true, volume = 0.6 } = {}) {
  return {
    src,
    loop,
    volume,
  };
}

export const ClimbingModes = Object.freeze({
  NONE: 'none',
  LADDER: 'ladder',
  STAIRS: 'stairs',
});

export const BuildingIds = Object.freeze({
  LEFT: 'left',
  RIGHT: 'right',
});

// Body convention: Position is the entity's feet point — x is the horizontal
// center of the feet, y is the feet level. The body AABB spans
// [x - width/2, x + width/2) horizontally and [y, y + height) vertically.

export function createPosition(x = 0, y = 0) {
  return { x, y };
}

export function createVelocity(x = 0, y = 0) {
  return { x, y };
}

export function createBody(width, height) {
  return { width, height };
}

export function createGravity(scale = 1) {
  return { scale };
}

export function createGrounded(value = false, floorId = null) {
  return { value, floorId };
}

export function createClimbing(mode = ClimbingModes.NONE) {
  return { mode, betweenFloors: false };
}

export function createInsideBuilding(buildingId = null, floor = 0) {
  return { buildingId, floor };
}

export function createBoundsConstrained() {
  return {};
}

export const FacingDirs = Object.freeze({
  LEFT: 'left',
  RIGHT: 'right',
  UP: 'up',
  DOWN: 'down',
});

export const AnimStates = Object.freeze({
  IDLE: 'idle',
  RUN: 'run',
  SHOOT: 'shoot',
  CLIMB: 'climb',
  ATTACK: 'attack',
  DEATH: 'death',
});

export function createPlayer() {
  return {};
}

export function createFacing(dir = FacingDirs.RIGHT) {
  return { dir };
}

export function createAnimState(state = AnimStates.IDLE) {
  return { state, frame: 0, timer: 0 };
}

export function createSprite({ sheet, frameW, frameH, cols, rows = 1, flipX = false }) {
  return { sheet, frameW, frameH, cols, rows, flipX };
}

export function createShooting(active = false) {
  return { active };
}

// Weapon — Phase 6 machine gun. Fires continuously at fireInterval while the
// trigger is held; heat builds during continuous fire and hitting burstWindow
// forces a `cooldown`-second silence (the Cooldown debuff component marks that
// state and is the single source for its remaining time). heat resets only
// when the cooldown completes — releasing the trigger pauses heating but keeps
// the heat. sinceLastShot starts at Infinity so the first held tick fires
// immediately.
export function createWeapon({
  fireInterval = 1 / 3,
  burstWindow = 1.0,
  cooldown = 0.5,
  heat = 0,
  sinceLastShot = Infinity,
} = {}) {
  return { fireInterval, burstWindow, cooldown, heat, sinceLastShot };
}

// Cooldown — Phase 6 overheat debuff. Pure data; weaponSystem counts it down
// and blocks firing while present. Presence on an entity IS the debuff state
// (buffs/debuffs as system state, per AGENTS.md); renderSystem derives the
// gray sprite tint from it.
export function createCooldown(timer = 0) {
  return { timer };
}

// Lifetime — generic ephemeral entity timer (muzzle flash, hit sparks).
// lifetimeSystem counts it down and destroys the entity at zero; when the
// entity also has AnimState + Sprite the frame cursor tracks elapsed fraction
// (one-shot animation over the lifetime).
export function createLifetime(duration) {
  return { timer: duration, duration };
}

export const Teams = Object.freeze({
  PLAYER: 'player',
  ENEMY: 'enemy',
});

export function createTeam(side = Teams.ENEMY) {
  return { side };
}

export function createHealth(hp = 1, maxHp = hp) {
  return { hp, maxHp };
}

export function createHitFlash(timer = 0) {
  return { timer };
}

export function createDead(duration = 0) {
  return { timer: duration, duration };
}

// Projectile — Phase 5 framework. dx/dy is a unit direction, speed in px/s.
// context: frozen copy of the shooter's zone context ({buildingId, floor}) at
// fire time — the projectile collides only with entities in that context and
// dies on its bounds (see projectileSystem).
export function createProjectile({ dx = 1, dy = 0, speed = 480, damage = 1, context = null } = {}) {
  return { dx, dy, speed, damage, context };
}

// Enemy — Phase 7 type marker. Pure data; per-type stats (sheets, frames,
// health) live in factories.js ENEMY_DEFS keyed by `type`. speed/scoreValue
// are denormalized here so systems read them straight off the component.
export function createEnemy({ type, speed, scoreValue }) {
  return { type, speed, scoreValue };
}

// EnemyAI — Phase 7 behavior state (enemyAISystem owns writes).
//   state: 'seek' (walk toward the player's zone), 'climb' (on ladder/stairs),
//     'attack' (adjacent to the player), 'flee' (gave up, walking off-screen —
//     spawnSystem vanishes it past the scene edge and queues a replacement).
//   thinkTimer: countdown to the next give-up roll (outdoor, player indoor).
//   fleeDir: horizontal walk-off direction chosen when entering 'flee'.
export const EnemyAIStates = Object.freeze({
  SEEK: 'seek',
  CLIMB: 'climb',
  ATTACK: 'attack',
  FLEE: 'flee',
});

export function createEnemyAI() {
  return { state: EnemyAIStates.SEEK, thinkTimer: 3, fleeDir: 1 };
}

// Attacking — melee attack intent flag, the enemy analogue of Shooting.
// enemyAISystem raises it while adjacent to the player; animationSystem maps
// it to the attack sheet. Contact damage itself is collisionSystem's job —
// the anim is a cosmetic flourish.
export function createAttacking(active = false) {
  return { active };
}

// KillStats — Phase 7 difficulty bookkeeping on the game entity. damageSystem
// increments kills per enemy death; spawnSystem reads it to schedule waves.
export function createKillStats(kills = 0) {
  return { kills };
}
