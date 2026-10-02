import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CUBE_FACES,
  cameraBasisFromAngles,
  cubeFaceFromDirection,
  directionFromAngles,
  halfTangentsFromFov,
  hotspotNavigationOf,
  hotspotPreloadOf,
  modelHit,
  normalizeVector,
  placeHotspotPlane,
  placePlane,
  placePoint,
  planeBasis,
  sampleTileFrame,
  sceneDirection,
  sceneModelOf,
  tileLevelsOf,
} from '../dist/internal.js';

const VIEWPORT = { width: 1000, height: 1000 };
const MODEL = sceneModelOf(1.5);
const STEP = { offset: { x: 0, y: 0, z: 1 }, model: MODEL };
const AT_CENTRE = { offset: { x: 0, y: 0, z: 0 }, model: MODEL };
/**
 * Элементы matrix3d, которые действуют на плоскость элемента (z элемента равен 0).
 */
const PROJECTIVE_ENTRIES = [0, 1, 3, 4, 5, 7, 12, 13, 15];
const toRadians = (degrees) => (degrees * Math.PI) / 180;

const cameraLooking = (yaw, pitch, space) => ({
  basis: cameraBasisFromAngles(toRadians(yaw), toRadians(pitch), 0),
  halfTangents: halfTangentsFromFov(toRadians(90), 'max', 1),
  ...(space === undefined ? {} : { space }),
});

const tileFrameOf = (space) => ({ ...cameraLooking(0, -45, space), buffer: { width: 768, height: 768 } });

const assertClose = (actual, expected, epsilon = 1e-6) => {
  assert.ok(Math.abs(actual - expected) < epsilon, `${String(actual)} ≠ ${String(expected)}`);
};

describe('scene-space · Хотспоты при сдвиге камеры', () => {
  it('Метка на полу едет вместе с полом: в её пикселе изображена та же точка пола', () => {
    const camera = cameraLooking(0, -30, STEP);
    const floorPoint = { x: 0.5, y: -1.5, z: 2 };
    const fromCamera = { x: 0.5, y: -1.5, z: 1 };
    const placed = placePoint(floorPoint, camera, VIEWPORT);
    const shown = modelHit(MODEL, STEP.offset, normalizeVector(fromCamera));

    assert.ok(placed.isInView);
    assertClose(shown.x, 0.5);
    assertClose(shown.y, -1.5);
    assertClose(shown.z, 2);
  });

  it('Подпись на стене: точка сферы стоит там, где изображено её направление панорамы', () => {
    const camera = cameraLooking(-60, 0, STEP);
    const placed = placePoint({ yaw: -60, pitch: 2 }, camera, VIEWPORT);
    const normalized = { x: (2 * placed.x) / VIEWPORT.width - 1, y: 1 - (2 * placed.y) / VIEWPORT.height };
    const { basis, halfTangents } = camera;
    const ray = normalizeVector({
      x:
        basis.right.x * normalized.x * halfTangents.width +
        basis.up.x * normalized.y * halfTangents.height +
        basis.forward.x,
      y:
        basis.right.y * normalized.x * halfTangents.width +
        basis.up.y * normalized.y * halfTangents.height +
        basis.forward.y,
      z:
        basis.right.z * normalized.x * halfTangents.width +
        basis.up.z * normalized.y * halfTangents.height +
        basis.forward.z,
    });
    const shownDirection = sceneDirection(MODEL, STEP.offset, ray);
    const expected = directionFromAngles(toRadians(-60), toRadians(2));

    assertClose(shownDirection.x, expected.x);
    assertClose(shownDirection.y, expected.y);
    assertClose(shownDirection.z, expected.z);
  });

  it('из центра пространство ничего не меняет: точка и плоскость точки сферы — те же', () => {
    const position = { yaw: 20, pitch: -40 };
    const plain = cameraLooking(10, -30);
    const spaced = cameraLooking(10, -30, AT_CENTRE);
    const point = directionFromAngles(toRadians(20), toRadians(-40));
    const basis = planeBasis(point, undefined, 0);
    const element = { width: 100, height: 40, anchorX: 0.5, anchorY: 0.5, worldPerPixel: 0.002 };
    const withoutSpace = placePlane(point, basis, element, plain, VIEWPORT);
    const withSpace = placeHotspotPlane(position, basis, element, spaced, VIEWPORT);

    assert.deepEqual(placePoint(position, spaced, VIEWPORT), placePoint(position, plain, VIEWPORT));
    for (const index of PROJECTIVE_ENTRIES) {
      assertClose(withSpace[index] / withSpace[15], withoutSpace[index] / withoutSpace[15]);
    }
  });
});

describe('scene-transitions · Точка шага (клик по хотспоту)', () => {
  const floorSpot = {
    id: 'to-balcony',
    position: { x: 0.2, y: -1.5, z: -2.5 },
    target: { scene: 'balcony', transition: { type: 'move' } },
  };

  it('Клик по метке на полу: шаг без своей point идёт к position хотспота', () => {
    assert.deepEqual(hotspotNavigationOf(floorSpot), {
      sceneId: 'balcony',
      options: { transition: { type: 'move', point: { x: 0.2, y: -1.5, z: -2.5 } } },
    });
  });

  it('своя point, смешивание и хотспот без target не меняются', () => {
    const withPoint = {
      ...floorSpot,
      target: { scene: 'balcony', transition: { type: 'move', point: { yaw: 0, pitch: -40 } } },
    };
    const blend = { ...floorSpot, target: { scene: 'balcony', transition: { type: 'blend' } } };

    assert.deepEqual(hotspotNavigationOf(withPoint).options.transition.point, { yaw: 0, pitch: -40 });
    assert.equal(hotspotNavigationOf(blend).options.transition.point, undefined);
    assert.equal(hotspotNavigationOf({ id: 'info', position: { yaw: 0, pitch: 0 } }), null);
  });

  it('предзагрузка цели шага — для вида keep, как появится сцена', () => {
    assert.deepEqual(hotspotPreloadOf(floorSpot.target).options, { view: 'keep' });
    assert.deepEqual(
      hotspotPreloadOf({ scene: 'balcony', transition: { type: 'move' }, view: 'scene' }).options,
      {
        view: 'scene',
      },
    );
  });
});

describe('multiresolution · Видимые тайлы при сдвиге камеры', () => {
  const levels = tileLevelsOf({
    type: 'cube',
    url: '{level}/{face}/{row}_{col}',
    tileSize: 512,
    levels: [512, 1024, 2048],
  });

  it('из центра выборка та же, что без пространства', () => {
    assert.deepEqual(
      sampleTileFrame(tileFrameOf(AT_CENTRE), levels, 512),
      sampleTileFrame(tileFrameOf(), levels, 512),
    );
  });

  it('при шаге центр кадра показывает точку пола, видимую из сдвинутой камеры', () => {
    const samples = sampleTileFrame(tileFrameOf(STEP), levels, 512);
    const centre = samples.find((sample) => sample.distance === 0);
    const expected = cubeFaceFromDirection(
      sceneDirection(MODEL, STEP.offset, directionFromAngles(0, toRadians(-45))),
    );

    assert.equal(centre.face, CUBE_FACES.indexOf(expected.face));
    assertClose(centre.point.s, expected.s);
    assertClose(centre.point.t, expected.t);
  });
});
