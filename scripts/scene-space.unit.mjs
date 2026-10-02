import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  directionFromAngles,
  modelHit,
  modelPointInDirection,
  normalizeVector,
  rotateYaw,
  sceneDirection,
  sceneModelOf,
  toNextScene,
  transferBetweenPlaces,
} from '../dist/internal.js';

const EPSILON = 1e-9;
const toRadians = (degrees) => (degrees * Math.PI) / 180;
const vector = (x, y, z) => ({ x, y, z });
const ZERO = vector(0, 0, 0);

const assertVector = (actual, expected, epsilon = EPSILON) => {
  for (const axis of ['x', 'y', 'z']) {
    assert.ok(
      Math.abs(actual[axis] - expected[axis]) < epsilon,
      `${axis}: ${String(actual[axis])} ≠ ${String(expected[axis])}`,
    );
  }
};

const yawOf = (direction) => (Math.atan2(direction.x, direction.z) * 180) / Math.PI;

describe('scene-space · Модель пространства сцены', () => {
  it('радиус — три высоты камеры, без высоты — 1, во время шага — не меньше двух длин шага', () => {
    assert.deepEqual(sceneModelOf(1.5), { floorDepth: 1.5, radius: 4.5 });
    assert.deepEqual(sceneModelOf(null), { floorDepth: null, radius: 1 });
    assert.equal(sceneModelOf(1.5, 3).radius, 6);
  });

  it('Камера в центре: направление выборки — сам луч', () => {
    const model = sceneModelOf(1.5);

    for (const ray of [
      vector(0, 0, 1),
      normalizeVector(vector(0.3, -0.8, 0.2)),
      normalizeVector(vector(-1, 2, -3)),
    ]) {
      assert.equal(sceneDirection(model, ZERO, ray), ray);
    }
  });

  it('из центра точка модели лежит ровно в своём направлении', () => {
    const model = sceneModelOf(1.5);
    const down = normalizeVector(vector(0, -1.5, 3));

    assertVector(normalizeVector(modelHit(model, ZERO, down)), down);
  });

  it('Шаг по полу: точка пола { 0, −1.5, 3 } видна из камеры, сдвинутой на 1 вперёд, в направлении { 0, −1.5, 2 }', () => {
    const model = sceneModelOf(1.5);
    const camera = vector(0, 0, 1);
    const ray = normalizeVector(vector(0, -1.5, 2));

    assertVector(modelHit(model, camera, ray), vector(0, -1.5, 3));
    assertVector(sceneDirection(model, camera, ray), normalizeVector(vector(0, -1.5, 3)));
  });

  it('без высоты камеры пола нет: луч вниз попадает в сферу', () => {
    const model = sceneModelOf(null);
    const hit = modelHit(model, vector(0, 0, 0.5), vector(0, -1, 0));

    assert.ok(Math.abs(Math.hypot(hit.x, hit.y, hit.z) - 1) < EPSILON);
  });

  it('выше горизонта — сфера, пол дальше сферы не продолжается', () => {
    const model = sceneModelOf(1.5);
    const up = modelHit(model, vector(0, 0, 1), normalizeVector(vector(0, 1, 1)));
    const almostFlat = modelHit(model, ZERO, normalizeVector(vector(0, -0.01, 1)));

    assert.ok(Math.abs(Math.hypot(up.x, up.y, up.z) - 4.5) < EPSILON);
    assert.ok(Math.abs(Math.hypot(almostFlat.x, almostFlat.y, almostFlat.z) - 4.5) < EPSILON);
  });

  it('точка сферы получает место на модели: под горизонтом — на полу', () => {
    const model = sceneModelOf(1.5);
    const floorPoint = modelPointInDirection(model, directionFromAngles(0, toRadians(-45)));

    assertVector(floorPoint, vector(0, -1.5, 1.5));
  });
});

describe('scene-transitions · Доворот новой сцены (пересчёт между сценами)', () => {
  it('rotateYaw увеличивает yaw на угол', () => {
    const turned = rotateYaw(directionFromAngles(toRadians(10), 0), toRadians(-30));

    assert.ok(Math.abs(yawOf(turned) + 20) < 1e-9);
  });

  it('Две комнаты в одной системе координат: центр спальни в осях кухни и её yaw 0 — это yaw 90 кухни', () => {
    const transfer = transferBetweenPlaces(
      { position: ZERO, heading: 0 },
      { position: vector(4, 0, 2), heading: toRadians(90) },
    );

    assertVector(transfer.center, vector(4, 0, 2));
    assert.ok(Math.abs(yawOf(rotateYaw(directionFromAngles(toRadians(90), 0), transfer.turn))) < 1e-9);
  });

  it('у повёрнутой старой сцены центр новой считается в её осях', () => {
    const transfer = transferBetweenPlaces(
      { position: vector(1, 0, 1), heading: toRadians(90) },
      { position: vector(3, 0, 1), heading: toRadians(90) },
    );

    assertVector(transfer.center, vector(0, 0, 2));
    assert.equal(transfer.turn, 0);
  });

  it('точка старой сцены в новой: центр новой сцены становится нулём', () => {
    const transfer = { center: vector(0.2, 0, -2.5), turn: toRadians(-30) };

    assertVector(toNextScene(transfer, vector(0.2, 0, -2.5)), ZERO);
  });
});
