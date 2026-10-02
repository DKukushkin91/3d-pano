import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EnumFovMode,
  HOTSPOT_ANCHOR_FRACTIONS,
  cameraBasisFromAngles,
  halfTangentsFromFov,
  hotspotDistance,
  hotspotPoint,
  placePlane,
  placePoint,
  planeBasis,
  screenFromDirection,
  toRadians,
} from '../dist/internal.js';

const VIEWPORT = { width: 1600, height: 900 };
const PIXEL_TOLERANCE = 0.5;
const VECTOR_TOLERANCE = 1e-9;

const createCamera = ({ yaw = 0, pitch = 0, fov = 90 } = {}) => ({
  basis: cameraBasisFromAngles(toRadians(yaw), toRadians(pitch), 0),
  halfTangents: halfTangentsFromFov(toRadians(fov), EnumFovMode.Max, VIEWPORT.width / VIEWPORT.height),
});

const createElement = (fields = {}) => ({
  width: 100,
  height: 100,
  anchorX: 0.5,
  anchorY: 0.5,
  worldPerPixel: 0.005,
  ...fields,
});

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

const assertVectorClose = (actual, expected) => {
  for (const axis of ['x', 'y', 'z']) {
    assert.ok(
      Math.abs(actual[axis] - expected[axis]) <= VECTOR_TOLERANCE,
      `${axis}: expected ${String(expected[axis])}, got ${String(actual[axis])}`,
    );
  }
};

const project = (camera, point) => screenFromDirection(point, VIEWPORT, camera.basis, camera.halfTangents);

describe('hotspots · Хотспот в плоскости', () => {
  it('Метка на полу: углы через matrix3d совпадают с project углов квадрата 0.5 × 0.5 на полу', () => {
    const camera = createCamera({ pitch: -30 });
    const point = { x: 0, y: -1.5, z: 2 };
    const basis = planeBasis(point, { yaw: 0, pitch: 90 }, 0);
    const matrix = placePlane(point, basis, createElement(), camera, VIEWPORT);
    const elementCorners = [
      [-50, -50],
      [50, -50],
      [-50, 50],
      [50, 50],
    ];
    const floorCorners = [
      { x: -0.25, y: -1.5, z: 2.25 },
      { x: 0.25, y: -1.5, z: 2.25 },
      { x: -0.25, y: -1.5, z: 1.75 },
      { x: 0.25, y: -1.5, z: 1.75 },
    ];

    assert.notEqual(matrix, null);
    elementCorners.forEach(([along, across], index) => {
      assertPointClose(applyMatrix(matrix, along, across), project(camera, floorCorners[index]));
    });
  });

  it('Надпись на полу читается с места камеры: верх смотрит от центра, правый край — вправо', () => {
    const ahead = planeBasis({ x: 0, y: -1.5, z: 2 }, { yaw: 0, pitch: 90 }, 0);
    const onTheRight = planeBasis({ x: 2, y: -1.5, z: 0 }, { yaw: 0, pitch: 90 }, 0);

    assertVectorClose(ahead.up, { x: 0, y: 0, z: 1 });
    assertVectorClose(ahead.right, { x: 1, y: 0, z: 0 });
    assertVectorClose(onTheRight.up, { x: 1, y: 0, z: 0 });
    assertVectorClose(onTheRight.right, cameraBasisFromAngles(toRadians(90), 0, 0).right);
  });

  it('надпись под камерой: верх смотрит в сторону facing.yaw', () => {
    const basis = planeBasis({ x: 0, y: -1.5, z: 0 }, { yaw: 90, pitch: 90 }, 0);

    assertVectorClose(basis.up, { x: 1, y: 0, z: 0 });
  });

  it('spin 90 поворачивает верх к правому краю — по часовой при взгляде на лицевую сторону', () => {
    const point = { x: 0, y: 0, z: 3 };
    const plain = planeBasis(point, undefined, 0);
    const spun = planeBasis(point, undefined, 90);

    assertVectorClose(spun.up, plain.right);
    assertVectorClose(spun.right, { x: -plain.up.x, y: -plain.up.y, z: -plain.up.z });
  });

  it('Табличка на стене: без facing смотрит в центр, при меньшем FOV растёт вместе с панорамой', () => {
    const point = { x: 0, y: 0, z: 3 };
    const basis = planeBasis(point, undefined, 0);
    const widthAt = (fov) => {
      const matrix = placePlane(point, basis, createElement(), createCamera({ fov }), VIEWPORT);

      return applyMatrix(matrix, 50, 0).x - applyMatrix(matrix, -50, 0).x;
    };

    assertVectorClose(basis.normal, { x: 0, y: 0, z: -1 });
    assertVectorClose(basis.up, { x: 0, y: 1, z: 0 });
    assert.ok(
      Math.abs(widthAt(45) / widthAt(90) - Math.tan(toRadians(45)) / Math.tan(toRadians(22.5))) < 1e-6,
    );
  });

  it('якорь: точка якоря элемента лежит в проекции position', () => {
    const camera = createCamera();
    const point = { x: 0.5, y: 0.2, z: 3 };
    const element = createElement({ anchorX: 0.5, anchorY: 1 });
    const matrix = placePlane(point, planeBasis(point, undefined, 0), element, camera, VIEWPORT);

    assertPointClose(applyMatrix(matrix, 0, 0), project(camera, point));
  });

  it('точка сферы лежит на расстоянии 1, размер элемента ещё неизвестен — не показывать', () => {
    const point = hotspotPoint({ yaw: 0, pitch: 0 });

    assertVectorClose(point, { x: 0, y: 0, z: 1 });
    assert.equal(
      placePlane(
        point,
        planeBasis(point, undefined, 0),
        createElement({ width: 0 }),
        createCamera(),
        VIEWPORT,
      ),
      null,
    );
  });
});

describe('hotspots · Хотспот позади камеры', () => {
  it('Разворот: точка позади — null, впереди за краем кадра — isInView false', () => {
    const camera = createCamera();

    assert.equal(placePoint({ yaw: 180, pitch: 0 }, camera, VIEWPORT), null);
    assert.equal(placePoint({ yaw: 70, pitch: 0 }, camera, VIEWPORT)?.isInView, false);
    assert.equal(placePoint({ x: 0, y: 0, z: 5 }, camera, VIEWPORT)?.isInView, true);
  });

  it('плоскость позади камеры и пересекающая её — null', () => {
    const behind = { x: 0, y: -1.5, z: -2 };
    const crossing = { x: 0, y: -1.5, z: 0.2 };
    const floor = { yaw: 0, pitch: 90 };
    const camera = createCamera();

    assert.equal(placePlane(behind, planeBasis(behind, floor, 0), createElement(), camera, VIEWPORT), null);
    assert.equal(
      placePlane(
        crossing,
        planeBasis(crossing, floor, 0),
        createElement({ worldPerPixel: 0.01 }),
        camera,
        VIEWPORT,
      ),
      null,
    );
  });
});

describe('hotspots · Порядок наложения (расстояние)', () => {
  it('расстояние точки мира — длина вектора, точки сферы — 1', () => {
    assert.equal(hotspotDistance({ x: 3, y: 4, z: 0 }), 5);
    assert.ok(Math.abs(hotspotDistance({ yaw: 40, pitch: -10 }) - 1) < VECTOR_TOLERANCE);
  });
});

describe('hotspots · Якорь', () => {
  it('Пин с ножкой: bottom — середина нижнего края, углы и центр — свои доли', () => {
    assert.deepEqual(HOTSPOT_ANCHOR_FRACTIONS.bottom, { x: 0.5, y: 1 });
    assert.deepEqual(HOTSPOT_ANCHOR_FRACTIONS.center, { x: 0.5, y: 0.5 });
    assert.deepEqual(HOTSPOT_ANCHOR_FRACTIONS['bottom-left'], { x: 0, y: 1 });
    assert.deepEqual(HOTSPOT_ANCHOR_FRACTIONS['top-right'], { x: 1, y: 0 });
    assert.equal(Object.keys(HOTSPOT_ANCHOR_FRACTIONS).length, 9);
  });
});
