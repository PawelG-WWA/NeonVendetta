import {
  Components,
  FacingDirs,
  ClimbingModes,
  createCooldown,
} from '../components.js';
import { createBullet, createMuzzleFlash, MUZZLE_FLASH_SIZE } from '../factories.js';
import { LAYOUT } from '../../world/layout.js';

const TIME_EPSILON = 1e-9;
const MUZZLE_FLASH_HALF = MUZZLE_FLASH_SIZE / 2;

// Muzzle offsets from the player's feet-anchored Position: left/right fire
// from body mid (y + 20), up from just above body top (40 + 4), down from
// body mid downward.
const MUZZLE_OFFSETS = Object.freeze({
  [FacingDirs.LEFT]: Object.freeze({ dx: -24, dy: 20 }),
  [FacingDirs.RIGHT]: Object.freeze({ dx: 24, dy: 20 }),
  [FacingDirs.UP]: Object.freeze({ dx: 0, dy: 44 }),
  [FacingDirs.DOWN]: Object.freeze({ dx: 0, dy: -4 }),
});

const FIRE_DIRECTIONS = Object.freeze({
  [FacingDirs.LEFT]: Object.freeze({ dx: -1, dy: 0 }),
  [FacingDirs.RIGHT]: Object.freeze({ dx: 1, dy: 0 }),
  [FacingDirs.UP]: Object.freeze({ dx: 0, dy: 1 }),
  [FacingDirs.DOWN]: Object.freeze({ dx: 0, dy: -1 }),
});

const FIRE_QUERY = Object.freeze([
  Components.Player,
  Components.Shooting,
  Components.Weapon,
  Components.Position,
  Components.Facing,
  Components.InsideBuilding,
  Components.Climbing,
]);

const COOLDOWN_QUERY = Object.freeze([Components.Cooldown]);

// WeaponSystem — Phase 6 machine gun. Runs immediately after
// playerControllerSystem (firing intent is freshest there: Shooting.active and
// Facing were just written) and before physicsSystem, so bullets spawn from
// the pre-integration position the aim was made at.
//
// Fire pattern: while Shooting.active the gun fires one bullet every
// fireInterval (3 rps); heat builds at 1x real time during continuous fire and
// reaching burstWindow (1.0s — three shots) forces a Cooldown debuff: 500ms of
// silence (renderSystem derives the smoke-gray tint from the debuff). Heat
// resets only when the cooldown completes. Releasing the trigger pauses
// heating but KEEPS the heat (documented choice: feathering is punished less,
// but you cannot shed heat by releasing — only by riding out a full
// cooldown).
//
// Gate order: the overheat gate is evaluated BEFORE the fire gate, so a tick
// that pushes heat to the burst window starts the cooldown WITHOUT firing —
// feathering at heat just below the window cannot squeeze out a free extra
// shot on the same tick overheat begins.
//
// Ladder rule (design): on a ladder/stairs only up/down shots are allowed —
// horizontal fire is blocked entirely (no bullet, no heating).
export function createWeaponSystem(world) {
  const matches = [];
  const cooling = [];

  function startCooldown(id, weapon) {
    const existing = world.getComponent(id, Components.Cooldown);
    if (existing !== undefined) {
      existing.timer = weapon.cooldown;
    } else {
      world.addComponent(id, Components.Cooldown, createCooldown(weapon.cooldown));
    }
  }

  function endCooldown(id, weapon) {
    world.removeComponent(id, Components.Cooldown);
    if (weapon !== undefined) {
      weapon.heat = 0;
    }
  }

  // Muzzle flashes are static for their 80ms life, so clamp the spawn point
  // into the shooter's zone x-bounds (inset by half the flash quad) to keep
  // the quad out of the walls when firing point-blank at a wall.
  function clampFlashX(inside, x) {
    const minX = inside.buildingId === null
      ? LAYOUT.bounds.left
      : LAYOUT.buildings[inside.buildingId].minX;
    const maxX = inside.buildingId === null
      ? LAYOUT.bounds.right
      : LAYOUT.buildings[inside.buildingId].maxX;
    return Math.min(Math.max(x, minX + MUZZLE_FLASH_HALF), maxX - MUZZLE_FLASH_HALF);
  }

  return {
    update(dt) {
      world.queryInto(FIRE_QUERY, matches);
      for (let i = 0; i < matches.length; i++) {
        const id = matches[i];
        if (world.hasComponent(id, Components.Dead)) {
          continue;
        }
        const weapon = world.getComponent(id, Components.Weapon);
        weapon.sinceLastShot += dt;

        const cooldown = world.getComponent(id, Components.Cooldown);
        if (cooldown !== undefined) {
          cooldown.timer -= dt;
          if (cooldown.timer > TIME_EPSILON) {
            continue;
          }
          endCooldown(id, weapon);
          continue;
        }

        const shooting = world.getComponent(id, Components.Shooting);
        if (!shooting.active) {
          continue;
        }

        const climbing = world.getComponent(id, Components.Climbing);
        const facing = world.getComponent(id, Components.Facing);
        const horizontal =
          facing.dir === FacingDirs.LEFT || facing.dir === FacingDirs.RIGHT;
        if (climbing.mode !== ClimbingModes.NONE && horizontal) {
          continue;
        }

        weapon.heat += dt;

        if (weapon.heat + TIME_EPSILON >= weapon.burstWindow) {
          startCooldown(id, weapon);
          continue;
        }

        if (weapon.sinceLastShot + TIME_EPSILON >= weapon.fireInterval) {
          weapon.sinceLastShot = 0;
          const position = world.getComponent(id, Components.Position);
          const inside = world.getComponent(id, Components.InsideBuilding);
          const muzzle = MUZZLE_OFFSETS[facing.dir];
          const dir = FIRE_DIRECTIONS[facing.dir];
          const muzzleX = position.x + muzzle.dx;
          const muzzleY = position.y + muzzle.dy;
          createBullet(world, muzzleX, muzzleY, dir.dx, dir.dy, inside);
          createMuzzleFlash(world, clampFlashX(inside, muzzleX), muzzleY, inside);
        }
      }

      // Mid-cooldown state changes: damageSystem strips Weapon/Shooting when
      // the player dies, which removes the entity from FIRE_QUERY and would
      // strand the debuff forever. Remove it here.
      world.queryInto(COOLDOWN_QUERY, cooling);
      for (let i = 0; i < cooling.length; i++) {
        const id = cooling[i];
        if (
          !world.hasComponent(id, Components.Weapon) ||
          world.hasComponent(id, Components.Dead)
        ) {
          endCooldown(id, world.getComponent(id, Components.Weapon));
        }
      }
    },
  };
}
