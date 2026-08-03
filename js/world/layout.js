// World layout — single source of truth for physics (Phase 3) and AI (Phase 7).
//
// Coordinate convention:
//   +x right, +y up, world units = pixels.
//   y = 0 is the bottom of the road (lowest walkable point).
//   The scene spans x in [0, 1280), y in [0, 720).
//   Render mapping: image pixel (ix, iy, y-down from top) -> world (ix, 720 - iy).
//   The renderer uses an OrthographicCamera with bottom=0, top=720, so world
//   coordinates are passed to Three.js unconverted.
//
// Bounds convention: every minX/maxX/minY/maxY rectangle is half-open
// [min, max) — min is inside the region, max is the first value outside it.

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

const TOP = GAME_HEIGHT;

function imageToWorldY(imageY) {
  return TOP - imageY;
}

// Floor lines read from environment.png (image pixel rows, y-down from top).
// Single source for the floors arrays AND the climbable vertical clamps, so
// ladder/stairs maxY can never drift away from the top floor line.
const LEFT_FLOORS_IMAGE_Y = Object.freeze([
  596,
  474.6666666666667,
  353.33333333333337,
]);
const RIGHT_FLOORS_IMAGE_Y = Object.freeze([596, 476.8, 357.6, 238.4, 119.2]);

function buildFloors(floorsImageY) {
  return Object.freeze(
    floorsImageY.map((imageY, index) =>
      Object.freeze({ index, y: imageToWorldY(imageY) })
    )
  );
}

function topFloorImageY(floorsImageY) {
  return floorsImageY[floorsImageY.length - 1];
}

// Facade window data — renderSystem's window masking (req 8: indoor entities
// visible through windows). These describe the environment.png ART, so they
// are IMAGE pixel coordinates with y DOWN from the top (minY is the top
// edge), deliberately NOT converted to world Y like the physics rects above.
// world/facadeMask.js covers each facade rect with quads minus these window
// holes (plus the right building's ladder stripe, derived from ladder.minX/
// maxX so the exterior ladder stays visible).
//
// Left building: 4 windows x 3 floor rows, read from the Phase 0 art.
// Right building: a similar estimated grid (3 x 5), each row hanging 40–100
// image px above its floor line, matching the left building's proportions.
const LEFT_WINDOW_COLUMNS = Object.freeze([
  Object.freeze({ minX: 24, maxX: 152 }),
  Object.freeze({ minX: 196, maxX: 324 }),
  Object.freeze({ minX: 368, maxX: 496 }),
  Object.freeze({ minX: 540, maxX: 668 }),
]);
// Window rows reach 20 image px further down than the first-pass read so
// more of an indoor sprite shows through the openings.
const LEFT_WINDOW_ROWS = Object.freeze([
  Object.freeze({ minY: 256, maxY: 336 }),
  Object.freeze({ minY: 376, maxY: 456 }),
  Object.freeze({ minY: 496, maxY: 576 }),
]);

function buildWindowRects(columns, rows) {
  const rects = [];
  for (const row of rows) {
    for (const column of columns) {
      rects.push(
        Object.freeze({
          minX: column.minX,
          maxX: column.maxX,
          minY: row.minY,
          maxY: row.maxY,
        })
      );
    }
  }
  return Object.freeze(rects);
}

const RIGHT_WINDOW_COLUMNS = Object.freeze([
  Object.freeze({ minX: 772, maxX: 900 }),
  Object.freeze({ minX: 944, maxX: 1072 }),
  Object.freeze({ minX: 1116, maxX: 1244 }),
]);
const RIGHT_WINDOW_ROWS = Object.freeze(
  RIGHT_FLOORS_IMAGE_Y.map((floorImageY) =>
    Object.freeze({ minY: floorImageY - 100, maxY: floorImageY - 20 })
  )
);

export const LAYOUT = Object.freeze({
  bounds: Object.freeze({
    left: 0,
    right: GAME_WIDTH,
    bottom: 0,
    top: TOP,
  }),

  buildings: Object.freeze({
    left: Object.freeze({
      minX: 0,
      maxX: 744,
      minY: imageToWorldY(596),
      maxY: imageToWorldY(232),
      floors: buildFloors(LEFT_FLOORS_IMAGE_Y),
      stairs: Object.freeze({
        minX: 452,
        maxX: 740,
        minY: imageToWorldY(LEFT_FLOORS_IMAGE_Y[0]),
        // Vertical clamp ends at the TOP FLOOR line (366.67), so an entity
        // clamped at the top reads as standing on the top floor.
        maxY: imageToWorldY(topFloorImageY(LEFT_FLOORS_IMAGE_Y)),
      }),
      doorway: Object.freeze({
        minX: 232,
        maxX: 448,
        minY: imageToWorldY(592),
        maxY: imageToWorldY(504),
      }),
      facade: Object.freeze({ minX: 0, maxX: 744, minY: 232, maxY: 596 }),
      windows: buildWindowRects(LEFT_WINDOW_COLUMNS, LEFT_WINDOW_ROWS),
    }),

    right: Object.freeze({
      minX: 748,
      maxX: GAME_WIDTH,
      minY: imageToWorldY(596),
      maxY: TOP,
      floors: buildFloors(RIGHT_FLOORS_IMAGE_Y),
      // Exterior ladder — x-range measured from environment.png: the two
      // full-height olive steel rails (66,66,22) sit at image x 1024–1031 and
      // 1052–1055 with rungs between, so the art spans [1024, 1056).
      ladder: Object.freeze({
        minX: 1024,
        maxX: 1056,
        minY: imageToWorldY(RIGHT_FLOORS_IMAGE_Y[0]),
        // Vertical clamp ends at the TOP FLOOR line (600.8), so an entity
        // clamped at the top reads as standing on the top floor.
        maxY: imageToWorldY(topFloorImageY(RIGHT_FLOORS_IMAGE_Y)),
      }),
      // Ground-floor entrance zone, centered on the door art at ~x 950.
      // boundsSystem uses it for entry/exit symmetric with the left building.
      doorway: Object.freeze({
        minX: 920,
        maxX: 1000,
        minY: imageToWorldY(592),
        maxY: imageToWorldY(504),
      }),
      facade: Object.freeze({ minX: 748, maxX: GAME_WIDTH, minY: 0, maxY: 596 }),
      windows: buildWindowRects(RIGHT_WINDOW_COLUMNS, RIGHT_WINDOW_ROWS),
    }),
  }),

  walkable: Object.freeze({
    sidewalk: Object.freeze({
      minY: imageToWorldY(616),
      maxY: imageToWorldY(600),
    }),
    road: Object.freeze({
      minY: imageToWorldY(720),
      maxY: imageToWorldY(616),
    }),
  }),

  groundY: imageToWorldY(616),
});
