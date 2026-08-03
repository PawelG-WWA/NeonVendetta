import { computeFacadeCoverRects, buildFacadeMaskQuads } from '../js/world/facadeMask.js';
import { LAYOUT, GAME_WIDTH, GAME_HEIGHT } from '../js/world/layout.js';

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

function rectsOverlap(a, b) {
  return a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;
}

// Mirror of facadeMask.js's opening assembly: the building's window rects
// plus, for the right building, the full-height exterior ladder stripe.
function openingsOf(building) {
  const openings = building.windows.slice();
  if (building.ladder !== undefined) {
    openings.push({
      minX: building.ladder.minX,
      maxX: building.ladder.maxX,
      minY: building.facade.minY,
      maxY: building.facade.maxY,
    });
  }
  return openings;
}

// buildFacadeMaskQuads emits one quad per cover rect in world space; derive
// the image-space rect back (y flips: world y = GAME_HEIGHT - image maxY).
function imageRectsFromQuads(quads) {
  const rects = [];
  for (let i = 0; i < quads.length; i++) {
    const quad = quads[i];
    const maxY = GAME_HEIGHT - quad.y;
    rects.push({
      minX: quad.x,
      maxX: quad.x + quad.width,
      minY: maxY - quad.height,
      maxY,
    });
  }
  return rects;
}

function testCoverRectsAvoidWindows(buildingId) {
  const building = LAYOUT.buildings[buildingId];
  const rects = computeFacadeCoverRects(building.facade, openingsOf(building));
  let hits = 0;
  for (let i = 0; i < rects.length; i++) {
    for (let w = 0; w < building.windows.length; w++) {
      if (rectsOverlap(rects[i], building.windows[w])) {
        hits++;
      }
    }
  }
  check(hits === 0, 'facade-' + buildingId + ': no cover rect intersects a window rect');
}

function testLadderStripeOpen() {
  const building = LAYOUT.buildings.right;
  const rects = computeFacadeCoverRects(building.facade, openingsOf(building));
  const stripe = {
    minX: building.ladder.minX,
    maxX: building.ladder.maxX,
    minY: building.facade.minY,
    maxY: building.facade.maxY,
  };
  let hits = 0;
  for (let i = 0; i < rects.length; i++) {
    if (rectsOverlap(rects[i], stripe)) {
      hits++;
    }
  }
  check(hits === 0, 'facade-right: ladder stripe is fully open (no cover rect crosses it)');
}

function testRectsWithinBuildingBounds(buildingId) {
  const building = LAYOUT.buildings[buildingId];
  const facade = building.facade;
  const rects = computeFacadeCoverRects(facade, openingsOf(building));
  let outside = 0;
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i];
    if (
      rect.minX < facade.minX || rect.maxX > facade.maxX ||
      rect.minY < facade.minY || rect.maxY > facade.maxY ||
      rect.minX >= rect.maxX || rect.minY >= rect.maxY
    ) {
      outside++;
    }
  }
  check(outside === 0, 'facade-' + buildingId + ': every cover rect is a non-empty rect inside the facade bounds');
}

// Union coverage: per-pixel membership over the shipped quads (world-space
// reconstruction has ~1e-15 float noise at band edges, so lower bounds get a
// small epsilon; upper bounds stay strict, keeping the half-open convention).
// Every facade pixel outside the holes must be covered exactly once; every
// hole pixel never.
const COVERAGE_EPSILON = 1e-9;

function containsPixel(rect, px, py) {
  return (
    px >= rect.minX - COVERAGE_EPSILON && px < rect.maxX &&
    py >= rect.minY - COVERAGE_EPSILON && py < rect.maxY
  );
}

function testUnionCoverage(buildingId) {
  const building = LAYOUT.buildings[buildingId];
  const facade = building.facade;
  const openings = openingsOf(building);
  const quads = buildFacadeMaskQuads().filter(
    (quad) => quad.x >= facade.minX && quad.x + quad.width <= facade.maxX
  );
  const rects = imageRectsFromQuads(quads);

  let mismatches = 0;
  let overlapPixels = 0;
  let firstMismatch = null;
  for (let py = Math.ceil(facade.minY); py < Math.ceil(facade.maxY); py++) {
    for (let px = Math.ceil(facade.minX); px < Math.ceil(facade.maxX); px++) {
      let coverCount = 0;
      for (let i = 0; i < rects.length; i++) {
        if (containsPixel(rects[i], px, py)) {
          coverCount++;
        }
      }
      if (coverCount > 1) {
        overlapPixels++;
      }
      let open = false;
      for (let i = 0; i < openings.length; i++) {
        if (containsPixel(openings[i], px, py)) {
          open = true;
          break;
        }
      }
      const expected = open ? 0 : 1;
      if (coverCount !== expected) {
        mismatches++;
        if (firstMismatch === null) {
          firstMismatch = '(' + px + ',' + py + ') coverCount=' + coverCount + ' open=' + open;
        }
      }
    }
  }
  check(overlapPixels === 0, 'mask-' + buildingId + ': cover rects never overlap each other');
  check(
    mismatches === 0,
    'mask-' + buildingId + ': quad union covers the full facade minus holes exactly' +
      (firstMismatch === null ? '' : ' (first mismatch at ' + firstMismatch + ')')
  );
}

function testQuadCountMatchesCoverRects() {
  const buildings = LAYOUT.buildings;
  let expected = 0;
  for (const buildingId of Object.keys(buildings)) {
    expected += computeFacadeCoverRects(buildings[buildingId].facade, openingsOf(buildings[buildingId])).length;
  }
  const quads = buildFacadeMaskQuads();
  check(quads.length === expected, 'mask: one world-space quad per cover rect');
}

function testQuadUvSanity() {
  const quads = buildFacadeMaskQuads();
  let bad = 0;
  for (let i = 0; i < quads.length; i++) {
    const quad = quads[i];
    const inScene =
      quad.x >= 0 && quad.x + quad.width <= GAME_WIDTH &&
      quad.y >= 0 && quad.y + quad.height <= GAME_HEIGHT;
    const uvOrdered = quad.u0 >= 0 && quad.u0 < quad.u1 && quad.u1 <= 1 && quad.v0 >= 0 && quad.v0 < quad.v1 && quad.v1 <= 1;
    const uvMatchesRect =
      approx(quad.u0, quad.x / GAME_WIDTH) &&
      approx(quad.u1, (quad.x + quad.width) / GAME_WIDTH) &&
      approx(quad.v0, quad.y / GAME_HEIGHT) &&
      approx(quad.v1, (quad.y + quad.height) / GAME_HEIGHT);
    if (!inScene || !uvOrdered || !uvMatchesRect) {
      bad++;
    }
  }
  check(bad === 0, 'mask: every quad sits inside the scene with ordered UVs matching its rect');
}

function testRightWindowGridConsistent() {
  const right = LAYOUT.buildings.right;
  const windows = right.windows;
  check(windows.length === 15, 'windows-right: 3 columns x 5 floor rows = 15 rects');

  const expectedColumns = [772, 944, 1116];
  const columnsOk = windows.every(
    (rect) => rect.maxX - rect.minX === 128 && expectedColumns.includes(rect.minX)
  );
  check(columnsOk, 'windows-right: columns pinned at 772/944/1116, 128px wide');

  const rowsOk = right.floors.every((floor) => {
    const floorImageY = GAME_HEIGHT - floor.y;
    return windows.some(
      (rect) => approx(rect.minY, floorImageY - 100) && approx(rect.maxY, floorImageY - 20)
    );
  });
  check(rowsOk, 'windows-right: one row per floor, spanning 100px to 20px above the floor line');

  const withinOk = windows.every(
    (rect) =>
      rect.minX >= right.facade.minX && rect.maxX <= right.facade.maxX &&
      rect.minY >= right.facade.minY && rect.maxY <= right.facade.maxY
  );
  check(withinOk, 'windows-right: every window rect lies inside the facade bounds');
}

function testLadderWithinBuildingBounds() {
  const right = LAYOUT.buildings.right;
  const ladder = right.ladder;
  check(
    ladder.minX >= right.minX && ladder.maxX <= right.maxX,
    'ladder: x-range inside the right building bounds'
  );
  check(
    ladder.minX < ladder.maxX,
    'ladder: x-range is non-empty'
  );
  check(
    approx(ladder.minY, right.floors[0].y) &&
      approx(ladder.maxY, right.floors[right.floors.length - 1].y),
    'ladder: vertical range spans floor 0 to the top floor'
  );
}

testCoverRectsAvoidWindows('left');
testCoverRectsAvoidWindows('right');
testLadderStripeOpen();
testRectsWithinBuildingBounds('left');
testRectsWithinBuildingBounds('right');
testUnionCoverage('left');
testUnionCoverage('right');
testQuadCountMatchesCoverRects();
testQuadUvSanity();
testRightWindowGridConsistent();
testLadderWithinBuildingBounds();

console.log('---');
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) {
  process.exitCode = 1;
}
