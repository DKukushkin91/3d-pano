import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { moveFrameAt, resolveEasing, resolveMoveGeometry } from '../dist/internal.js';

const EPSILON = 1e-9;
const VIEW = { yaw: 0, pitch: 0, roll: 0, fov: 90, fovMode: 'max' };
const NOWHERE = { position: null, heading: 0, cameraHeight: 1.5 };
const vector = (x, y, z) => ({ x, y, z });

const assertVector = (actual, expected) => {
  for (const axis of ['x', 'y', 'z']) {
    assert.ok(
      Math.abs(actual[axis] - expected[axis]) < EPSILON,
      `${axis}: ${String(actual[axis])} ≠ ${String(expected[axis])}`,
    );
  }
};

const requestOf = (fields = {}) => ({
  from: NOWHERE,
  to: NOWHERE,
  view: VIEW,
  point: null,
  turn: null,
  blur: 0.5,
  ...fields,
});

const degreesOf = (radians) => (radians * 180) / Math.PI;

describe('scene-transitions · Точка шага', () => {
  it('Клик по метке на полу: камера идёт в точку над меткой на высоте центра', () => {
    const geometry = resolveMoveGeometry(requestOf({ point: vector(0.2, -1.5, -2.5) }));

    assertVector(geometry.step, vector(0.2, 0, -2.5));
    assertVector(geometry.transfer.center, vector(0.2, 0, -2.5));
  });

  it('Комнаты с позициями: камера идёт ровно в центр новой сцены, в том числе вверх', () => {
    const geometry = resolveMoveGeometry(
      requestOf({
        from: { position: vector(0, 0, 0), heading: 0, cameraHeight: 1.5 },
        to: { position: vector(3, 0.4, 1), heading: 0, cameraHeight: 1.5 },
      }),
    );

    assertVector(geometry.step, vector(3, 0.4, 1));
  });

  it('Без геометрии: камера идёт вперёд к точке модели в центре кадра', () => {
    const geometry = resolveMoveGeometry(
      requestOf({ from: { position: null, heading: 0, cameraHeight: null } }),
    );

    assertVector(geometry.step, vector(0, 0, 1));
  });

  it('центр кадра под горизонтом: шаг к точке пола над ней', () => {
    const geometry = resolveMoveGeometry(requestOf({ view: { ...VIEW, yaw: 90, pitch: -45 } }));

    assertVector(geometry.step, vector(1.5, 0, 0));
  });

  it('явная точка сильнее мест сцен: центр новой сцены считается в точке шага', () => {
    const geometry = resolveMoveGeometry(
      requestOf({
        from: { position: vector(0, 0, 0), heading: 0, cameraHeight: 1.5 },
        to: { position: vector(3, 0, 1), heading: 0, cameraHeight: 1.5 },
        point: { yaw: 0, pitch: -45 },
      }),
    );

    assertVector(geometry.step, vector(0, 0, 1.5));
    assertVector(geometry.transfer.center, geometry.step);
  });

  it('модели обеих сцен вмещают два шага', () => {
    const geometry = resolveMoveGeometry(requestOf({ point: vector(0, -1.5, 4) }));

    assert.equal(geometry.fromModel.radius, 8);
    assert.equal(geometry.toModel.floorDepth, 1.5);
  });
});

describe('scene-transitions · Доворот новой сцены (геометрия)', () => {
  it('Комнаты с разным heading: доворот — разность heading текущей и новой сцены', () => {
    const geometry = resolveMoveGeometry(
      requestOf({
        from: { position: null, heading: 0, cameraHeight: 1.5 },
        to: { position: null, heading: 90, cameraHeight: 1.5 },
      }),
    );

    assert.ok(Math.abs(degreesOf(geometry.transfer.turn) + 90) < EPSILON);
  });

  it('Явный доворот сильнее heading', () => {
    const geometry = resolveMoveGeometry(
      requestOf({ to: { position: null, heading: 90, cameraHeight: 1.5 }, turn: -30 }),
    );

    assert.ok(Math.abs(degreesOf(geometry.transfer.turn) + 30) < EPSILON);
  });
});

describe('scene-transitions · Переход «шаг» (кадры)', () => {
  it('Середина шага: камера на quad-out(0.5) пути, в новой сцене — в той же точке мира', () => {
    const geometry = resolveMoveGeometry(requestOf({ point: vector(0, -1.5, 2) }));
    const eased = resolveEasing('quad-out')(0.5);
    const frame = moveFrameAt(geometry, 0.5, eased);

    assertVector(frame.fromOffset, vector(0, 0, 2 * eased));
    assertVector(frame.toOffset, vector(0, 0, 2 * eased - 2));
  });

  it('в конце шага камера ровно в центре новой сцены', () => {
    const geometry = resolveMoveGeometry(requestOf({ point: vector(1.3, -1.5, -0.7), turn: 37 }));
    const frame = moveFrameAt(geometry, 1, 1);

    assert.deepEqual([frame.toOffset.x, frame.toOffset.y, frame.toOffset.z].map(Math.abs), [0, 0, 0]);
  });
});

describe('scene-transitions · Размытие шага', () => {
  it('Шаг без размытия: blur 0 — сила 0 во всех кадрах', () => {
    const geometry = resolveMoveGeometry(requestOf({ blur: 0 }));

    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      assert.equal(moveFrameAt(geometry, progress, progress).blurStrength, 0);
    }
  });

  it('Конец шага: размытия нет в начале и в конце, наибольшее — в середине', () => {
    const geometry = resolveMoveGeometry(requestOf({ blur: 0.5 }));

    assert.equal(moveFrameAt(geometry, 0, 0).blurStrength, 0);
    assert.equal(moveFrameAt(geometry, 1, 1).blurStrength, 0);
    assert.equal(moveFrameAt(geometry, 0.5, 0.75).blurStrength, 0.5);
    assert.ok(moveFrameAt(geometry, 0.25, 0.4).blurStrength < 0.5);
  });
});
