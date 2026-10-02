import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_LOOK_AT_DURATION_MS,
  DEFAULT_LOOK_AT_EASING,
  EnumBoundsMode,
  EnumEasing,
  EnumFovMode,
  LIBRARY_DEFAULT_LIMITS,
  createCameraState,
  lookAtView,
  resolveEasing,
  resolveLookAtRequest,
} from '../dist/internal.js';

const TOLERANCE = 1e-9;
const VIEWPORT = { width: 1600, height: 900 };
const POINT = { yaw: 40, pitch: -10 };

const linearEasing = (progress) => progress;

const createView = (fields = {}) => ({
  yaw: 0,
  pitch: 0,
  roll: 0,
  fov: 90,
  fovMode: EnumFovMode.Max,
  ...fields,
});

const assertClose = (actual, expected) => {
  assert.ok(Math.abs(actual - expected) <= TOLERANCE, `expected ${String(expected)}, got ${String(actual)}`);
};

const assertRangeError = (call, name) => {
  assert.throws(
    call,
    (error) =>
      error instanceof RangeError && error.message.startsWith('3d-pano:') && error.message.includes(name),
  );
};

describe('camera-motion · Плавный поворот к цели (аргументы)', () => {
  it('умолчания: 900 мс, cubic-out, поле обзора не меняется, без сигнала', () => {
    const request = resolveLookAtRequest(POINT, undefined);

    assert.equal(DEFAULT_LOOK_AT_DURATION_MS, 900);
    assert.equal(DEFAULT_LOOK_AT_EASING, EnumEasing.CubicOut);
    assert.equal(request.durationMs, 900);
    assert.equal(request.easing, resolveEasing(EnumEasing.CubicOut));
    assert.equal(request.fov, null);
    assert.equal(request.signal, null);
  });

  it('своя длительность, плавность, поле обзора и сигнал принимаются', () => {
    const controller = new AbortController();
    const request = resolveLookAtRequest(POINT, {
      durationMs: 300,
      easing: linearEasing,
      fov: 60,
      signal: controller.signal,
    });

    assert.deepEqual(
      { durationMs: request.durationMs, easing: request.easing, fov: request.fov, signal: request.signal },
      { durationMs: 300, easing: linearEasing, fov: 60, signal: controller.signal },
    );
    assert.equal(resolveLookAtRequest(POINT, { easing: 'sine-in-out' }).easing, resolveEasing('sine-in-out'));
  });

  it('цель копируется: изменение объекта хоста после вызова не влияет', () => {
    const target = { x: 1, y: 0, z: 0 };
    const request = resolveLookAtRequest(target, undefined);

    target.x = -1;

    assert.deepEqual(request.target, { x: 1, y: 0, z: 0 });
  });

  it('Точка мира: { x: 1, y: −1, z: 0 } — это yaw 90, pitch −45', () => {
    const view = lookAtView(resolveLookAtRequest({ x: 1, y: -1, z: 0 }, undefined), createView());

    assertClose(view.yaw, 90);
    assertClose(view.pitch, -45);
  });

  it('точка сферы берётся как есть, крен и режим FOV — текущие, fov — из опций', () => {
    const current = createView({ yaw: -30, roll: 5, fovMode: EnumFovMode.Vertical });
    const view = lookAtView(resolveLookAtRequest(POINT, { fov: 60 }), current);

    assert.deepEqual(view, { yaw: 40, pitch: -10, roll: 5, fov: 60, fovMode: EnumFovMode.Vertical });
  });

  it('направление строго вверх или вниз оставляет текущий yaw, точка сферы у полюса — свой yaw', () => {
    const current = createView({ yaw: 37 });
    const up = lookAtView(resolveLookAtRequest({ x: 0, y: 2, z: 0 }, undefined), current);
    const down = lookAtView(resolveLookAtRequest({ x: 0, y: -1, z: 0 }, undefined), current);

    assert.deepEqual([up.yaw, up.pitch, down.yaw, down.pitch], [37, 90, 37, -90]);
    assert.equal(lookAtView(resolveLookAtRequest({ yaw: 10, pitch: 90 }, undefined), current).yaw, 10);
  });
});

describe('camera-motion · Проверка опций поворота', () => {
  it('Нулевое направление: RangeError с именем target', () => {
    assertRangeError(() => resolveLookAtRequest({ x: 0, y: 0, z: 0 }, undefined), 'target');
  });

  it('цель без конечных yaw и pitch или x, y, z — RangeError с именем target', () => {
    for (const target of [
      { yaw: Number.NaN, pitch: 0 },
      { yaw: 10 },
      { x: Infinity, y: 0, z: 1 },
      { x: 1 },
      null,
      'north',
    ]) {
      assertRangeError(() => resolveLookAtRequest(target, undefined), 'target');
    }
  });

  it('Отрицательная длительность: RangeError с именем durationMs', () => {
    assertRangeError(() => resolveLookAtRequest(POINT, { durationMs: -1 }), 'durationMs');
  });

  it('нечисловая и бесконечная длительность — RangeError', () => {
    assertRangeError(() => resolveLookAtRequest(POINT, { durationMs: Number.NaN }), 'durationMs');
    assertRangeError(() => resolveLookAtRequest(POINT, { durationMs: Infinity }), 'durationMs');
  });

  it('неположительный, нечисловой и бесконечный fov — RangeError', () => {
    for (const fov of [0, -5, Number.NaN, Infinity]) {
      assertRangeError(() => resolveLookAtRequest(POINT, { fov }), 'fov');
    }
  });

  it('неизвестная плавность — RangeError с именем easing', () => {
    assertRangeError(() => resolveLookAtRequest(POINT, { easing: 'wobble' }), 'easing');
  });

  it('signal не AbortSignal — RangeError с именем signal', () => {
    for (const signal of [{}, 'abort', { aborted: false }]) {
      assertRangeError(() => resolveLookAtRequest(POINT, { signal }), 'signal');
    }
  });

  it('отменённый сигнал не прячет ошибку в других аргументах', () => {
    const controller = new AbortController();

    controller.abort();

    assertRangeError(
      () => resolveLookAtRequest(POINT, { durationMs: -1, signal: controller.signal }),
      'durationMs',
    );
    assert.equal(resolveLookAtRequest(POINT, { signal: controller.signal }).signal, controller.signal);
  });
});

describe('camera-motion · Ограничения обзора при повороте (цель)', () => {
  it('FOV меньше минимума: fov 20 при пределах [30, 120] даёт 30, а вид камеры не меняется', () => {
    const camera = createCameraState(createView(), { ...LIBRARY_DEFAULT_LIMITS, fov: [30, 120] }, VIEWPORT);
    const target = camera.constrained(createView({ yaw: 40, fov: 20 }));

    assert.equal(target.fov, 30);
    assert.equal(target.yaw, 40);
    assert.deepEqual(camera.getView(), createView());
  });

  it('диапазон yaw читается из bounds, у auto и none его нет', () => {
    const ranged = createCameraState(
      createView(),
      { ...LIBRARY_DEFAULT_LIMITS, bounds: { yaw: [-170, 170] } },
      VIEWPORT,
    );
    const automatic = createCameraState(
      createView(),
      { ...LIBRARY_DEFAULT_LIMITS, bounds: EnumBoundsMode.Auto },
      VIEWPORT,
    );

    assert.deepEqual(ranged.yawRange(), [-170, 170]);
    assert.equal(automatic.yawRange(), undefined);
  });
});
