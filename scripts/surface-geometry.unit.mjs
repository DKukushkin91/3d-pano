import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  HOTSPOT_ANCHOR_FRACTIONS,
  SURFACE_NEAR_PLANE,
  addVectors,
  cameraBasisFromAngles,
  halfTangentsFromFov,
  placeHotspotPlane,
  planeBasis,
  scaleVector,
  sceneModelOf,
  screenFromDirection,
  surfaceDepth,
  surfaceDrawOrder,
  surfaceQuad,
} from '../dist/internal.js';

const VIEWPORT = { width: 1000, height: 800 };
const PIXEL_TOLERANCE = 0.5;
const FLOOR_POINT = { x: 0, y: -1.5, z: 2 };
const FLOOR_FACING = { yaw: 0, pitch: 90 };
const WALL_POINT = { yaw: 30, pitch: 5 };
const STEP = { offset: { x: 0, y: 0, z: 1 }, model: sceneModelOf(1.5) };
const toRadians = (degrees) => (degrees * Math.PI) / 180;

const cameraLooking = (yaw, pitch, space) => ({
  basis: cameraBasisFromAngles(toRadians(yaw), toRadians(pitch), 0),
  halfTangents: halfTangentsFromFov(toRadians(90), 'max', VIEWPORT.width / VIEWPORT.height),
  ...(space === undefined ? {} : { space }),
});

const project = (camera, point) => screenFromDirection(point, VIEWPORT, camera.basis, camera.halfTangents);

const cornersOf = (quad) => [
  quad.origin,
  addVectors(quad.origin, quad.across),
  addVectors(quad.origin, quad.down),
  addVectors(quad.origin, addVectors(quad.across, quad.down)),
];

const pointAt = (quad, along, down) =>
  addVectors(quad.origin, addVectors(scaleVector(quad.across, along), scaleVector(quad.down, down)));

const applyMatrix = (matrix, along, across) => {
  const homogeneousX = matrix[0] * along + matrix[4] * across + matrix[12];
  const homogeneousY = matrix[1] * along + matrix[5] * across + matrix[13];
  const depth = matrix[3] * along + matrix[7] * across + matrix[15];

  return { x: homogeneousX / depth, y: homogeneousY / depth };
};

const assertPointClose = (actual, expected) => {
  assert.ok(
    Math.abs(actual.x - expected.x) <= PIXEL_TOLERANCE && Math.abs(actual.y - expected.y) <= PIXEL_TOLERANCE,
    `expected (${String(expected.x)}, ${String(expected.y)}), got (${String(actual.x)}, ${String(actual.y)})`,
  );
};

const sphereVector = ({ yaw, pitch }) => ({
  x: Math.sin(toRadians(yaw)) * Math.cos(toRadians(pitch)),
  y: Math.sin(toRadians(pitch)),
  z: Math.cos(toRadians(yaw)) * Math.cos(toRadians(pitch)),
});

const placementOf = ({ position, facing, anchor = 'center', width, aspect = 1 }) => {
  const fractions = HOTSPOT_ANCHOR_FRACTIONS[anchor];
  const basisPoint = 'yaw' in position ? sphereVector(position) : position;

  return {
    position,
    basis: planeBasis(basisPoint, facing, 0),
    anchorX: fractions.x,
    anchorY: fractions.y,
    width,
    aspect,
  };
};

/**
 * Углы элемента хотспота того же размера, поставленного `matrix3d`, — в пикселях элемента от якоря.
 */
const elementCorners = (element) => {
  const left = -element.anchorX * element.width;
  const top = -element.anchorY * element.height;

  return [
    [left, top],
    [left + element.width, top],
    [left, top + element.height],
    [left + element.width, top + element.height],
  ];
};

const assertSameAsElement = (placement, camera) => {
  const element = {
    width: 400,
    height: 400 * placement.aspect,
    anchorX: placement.anchorX,
    anchorY: placement.anchorY,
    worldPerPixel: placement.width / 400,
  };
  const matrix = placeHotspotPlane(placement.position, placement.basis, element, camera, VIEWPORT);
  const quad = surfaceQuad(placement, camera.space);

  assert.notEqual(matrix, null);
  cornersOf(quad).forEach((corner, index) => {
    const [along, across] = elementCorners(element)[index];

    assertPointClose(project(camera, corner), applyMatrix(matrix, along, across));
  });
};

describe('hotspot-surfaces · Размер и положение поверхности', () => {
  it('Диск в центре зоны: центр совпадает с центром элемента, углы — с project квадрата 0.125 на полу', () => {
    const camera = cameraLooking(0, -30);
    const half = 0.0625;
    const placement = placementOf({ position: FLOOR_POINT, facing: FLOOR_FACING, width: 0.125 });
    const quad = surfaceQuad(placement, undefined);
    const zone = { width: 100, height: 100, anchorX: 0.5, anchorY: 0.5, worldPerPixel: 0.005 };
    const matrix = placeHotspotPlane(FLOOR_POINT, placement.basis, zone, camera, VIEWPORT);
    const floorCorners = [
      { x: -half, y: -1.5, z: 2 + half },
      { x: half, y: -1.5, z: 2 + half },
      { x: -half, y: -1.5, z: 2 - half },
      { x: half, y: -1.5, z: 2 - half },
    ];

    assertPointClose(project(camera, pointAt(quad, 0.5, 0.5)), applyMatrix(matrix, 0, 0));
    cornersOf(quad).forEach((corner, index) => {
      assertPointClose(project(camera, corner), project(camera, floorCorners[index]));
    });
  });

  it('с той же шириной и пропорциями, что элемент, углы поверхности совпадают с углами элемента', () => {
    assertSameAsElement(
      placementOf({
        position: FLOOR_POINT,
        facing: FLOOR_FACING,
        anchor: 'top-left',
        width: 0.5,
        aspect: 0.6,
      }),
      cameraLooking(10, -35),
    );
  });

  it('Табличка с якорем снизу: 1 × 0.5, середина нижнего края на точке, уходит вверх', () => {
    const placement = placementOf({ position: WALL_POINT, anchor: 'bottom', width: 1, aspect: 0.5 });
    const quad = surfaceQuad(placement, undefined);
    const bottomMiddle = pointAt(quad, 0.5, 1);
    const top = pointAt(quad, 0.5, 0);

    const wallPoint = sphereVector(WALL_POINT);

    for (const axis of ['x', 'y', 'z']) {
      assert.ok(Math.abs(bottomMiddle[axis] - wallPoint[axis]) < 1e-9);
    }

    assert.ok(Math.abs(Math.hypot(quad.across.x, quad.across.y, quad.across.z) - 1) < 1e-9);
    assert.ok(Math.abs(Math.hypot(quad.down.x, quad.down.y, quad.down.z) - 0.5) < 1e-9);
    assert.ok(top.y > bottomMiddle.y);
    assertSameAsElement(placement, cameraLooking(30, 0));
  });

  it('Метка во время шага: поверхность едет вместе с элементом — на полу и на стене', () => {
    assertSameAsElement(
      placementOf({ position: FLOOR_POINT, facing: FLOOR_FACING, width: 0.5 }),
      cameraLooking(0, -40, STEP),
    );
    assertSameAsElement(
      placementOf({ position: WALL_POINT, width: 0.4, aspect: 0.75 }),
      cameraLooking(25, 0, STEP),
    );
  });

  it('точка сферы при сдвиге камеры растягивается на расстояние до модели', () => {
    const placement = placementOf({ position: WALL_POINT, width: 0.4 });
    const still = surfaceQuad(placement, undefined);
    const moved = surfaceQuad(placement, STEP);
    const scale = Math.hypot(moved.across.x, moved.across.y, moved.across.z) / 0.4;

    assert.ok(Math.abs(Math.hypot(still.across.x, still.across.y, still.across.z) - 0.4) < 1e-9);
    assert.ok(scale > 1);
  });
});

describe('hotspot-surfaces · Глубина поверхностей (порядок и глубина)', () => {
  it('порядок отрисовки — от дальних к ближним, равные — в исходном порядке', () => {
    const items = [
      { id: 'near', quad: { distance: 1 } },
      { id: 'far', quad: { distance: 5 } },
      { id: 'middle-a', quad: { distance: 2 } },
      { id: 'middle-b', quad: { distance: 2 } },
    ];

    assert.deepEqual(
      surfaceDrawOrder(items).map((item) => item.id),
      ['far', 'middle-a', 'middle-b', 'near'],
    );
    assert.deepEqual(
      items.map((item) => item.id),
      ['near', 'far', 'middle-a', 'middle-b'],
    );
  });

  it('глубина −1 на ближней плоскости, растёт с расстоянием и стремится к 1', () => {
    assert.equal(surfaceDepth(SURFACE_NEAR_PLANE), -1);
    assert.ok(surfaceDepth(1) < surfaceDepth(2));
    assert.ok(surfaceDepth(2) < surfaceDepth(100));
    assert.ok(surfaceDepth(1e6) < 1 && surfaceDepth(1e6) > 0.999);
  });
});
