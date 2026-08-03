import { Components } from '../components.js';
import { LAYOUT, GAME_WIDTH } from '../../world/layout.js';

const QUERY = Object.freeze([
  Components.Projectile,
  Components.Position,
  Components.Velocity,
  Components.Body,
]);

// ProjectileSystem — moves Projectile entities in a straight line (Velocity
// derived from the Projectile descriptor, so damageSystem never advances a
// corpse projectile) and destroys them at their zone context's bounds:
// outdoors the scene x-edges, indoors the building's walls. Hits are resolved
// by damageSystem via collisionSystem.
export function createProjectileSystem(world) {
  const matches = [];

  return {
    update(dt) {
      world.queryInto(QUERY, matches);
      for (let i = 0; i < matches.length; i++) {
        const id = matches[i];
        const projectile = world.getComponent(id, Components.Projectile);
        const position = world.getComponent(id, Components.Position);
        const velocity = world.getComponent(id, Components.Velocity);
        const body = world.getComponent(id, Components.Body);

        velocity.x = projectile.dx * projectile.speed;
        velocity.y = projectile.dy * projectile.speed;
        position.x += velocity.x * dt;
        position.y += velocity.y * dt;

        const halfWidth = body.width / 2;
        const context = projectile.context;
        const minX = context !== null && context.buildingId !== null
          ? LAYOUT.buildings[context.buildingId].minX
          : 0;
        const maxX = context !== null && context.buildingId !== null
          ? LAYOUT.buildings[context.buildingId].maxX
          : GAME_WIDTH;

        if (
          position.x - halfWidth <= minX ||
          position.x + halfWidth >= maxX ||
          position.y < LAYOUT.bounds.bottom ||
          position.y > LAYOUT.bounds.top
        ) {
          world.destroyEntity(id);
        }
      }
    },
  };
}
