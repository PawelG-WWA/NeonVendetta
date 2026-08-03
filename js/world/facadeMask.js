// Facade window masking (req 8: "player visible through windows when
// inside"). Indoor entities render at z=3 (renderSystem), outdoor entities at
// z=5, and this module provides the geometry for a facade-mask mesh at z=4
// that sits between them: the building fronts reconstructed FROM the
// environment.png texture itself (perfect visual match — no separate
// facade-with-holes asset exists), with holes where the windows (and the
// right building's exterior ladder stripe) are, so indoor sprites show
// through exactly those openings.
//
// The mask is a single merged BufferGeometry built once at renderSystem init
// from the quads below; all quads share the cached environment texture via
// per-vertex UVs (one texture, one material, one draw call).
import { LAYOUT, GAME_WIDTH, GAME_HEIGHT } from './layout.js';

// computeFacadeCoverRects — vertical-band sweep covering `facade` minus
// `openings` with non-overlapping rects. All rects are IMAGE pixel
// coordinates (y down from top, see layout.js). Pure function.
export function computeFacadeCoverRects(facade, openings) {
  const clipped = [];
  for (let i = 0; i < openings.length; i++) {
    const opening = openings[i];
    const minX = Math.max(opening.minX, facade.minX);
    const maxX = Math.min(opening.maxX, facade.maxX);
    const minY = Math.max(opening.minY, facade.minY);
    const maxY = Math.min(opening.maxY, facade.maxY);
    if (minX < maxX && minY < maxY) {
      clipped.push({ minX, maxX, minY, maxY });
    }
  }

  const yCuts = [facade.minY, facade.maxY];
  for (let i = 0; i < clipped.length; i++) {
    yCuts.push(clipped[i].minY, clipped[i].maxY);
  }
  yCuts.sort((a, b) => a - b);
  const bands = [];
  for (let i = 0; i < yCuts.length; i++) {
    if (bands.length === 0 || bands[bands.length - 1] !== yCuts[i]) {
      bands.push(yCuts[i]);
    }
  }

  const rects = [];
  const bandHoles = [];
  for (let band = 0; band < bands.length - 1; band++) {
    const minY = bands[band];
    const maxY = bands[band + 1];
    bandHoles.length = 0;
    for (let i = 0; i < clipped.length; i++) {
      const opening = clipped[i];
      if (opening.minY <= minY && opening.maxY >= maxY) {
        bandHoles.push(opening);
      }
    }
    bandHoles.sort((a, b) => a.minX - b.minX);
    let cursor = facade.minX;
    for (let i = 0; i < bandHoles.length; i++) {
      const hole = bandHoles[i];
      if (hole.minX > cursor) {
        rects.push({ minX: cursor, maxX: hole.minX, minY, maxY });
      }
      cursor = Math.max(cursor, hole.maxX);
    }
    if (cursor < facade.maxX) {
      rects.push({ minX: cursor, maxX: facade.maxX, minY, maxY });
    }
  }
  return rects;
}

// buildFacadeMaskQuads — world-space quads with environment.png UVs for the
// merged mask mesh: both building facades minus their windows, and minus a
// full-height stripe at the right building's ladder x-range so the exterior
// ladder (and anyone climbing it) stays visible.
export function buildFacadeMaskQuads() {
  const quads = [];
  for (const buildingId of Object.keys(LAYOUT.buildings)) {
    const building = LAYOUT.buildings[buildingId];
    const facade = building.facade;
    const openings = building.windows.slice();
    if (building.ladder !== undefined) {
      openings.push({
        minX: building.ladder.minX,
        maxX: building.ladder.maxX,
        minY: facade.minY,
        maxY: facade.maxY,
      });
    }
    const rects = computeFacadeCoverRects(facade, openings);
    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i];
      quads.push({
        x: rect.minX,
        y: GAME_HEIGHT - rect.maxY,
        width: rect.maxX - rect.minX,
        height: rect.maxY - rect.minY,
        u0: rect.minX / GAME_WIDTH,
        v0: 1 - rect.maxY / GAME_HEIGHT,
        u1: rect.maxX / GAME_WIDTH,
        v1: 1 - rect.minY / GAME_HEIGHT,
      });
    }
  }
  return quads;
}
