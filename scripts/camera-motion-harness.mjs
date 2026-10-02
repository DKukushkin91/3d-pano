import assert from 'node:assert/strict';

import {
  EnumFovMode,
  LIBRARY_DEFAULT_LIMITS,
  createCameraMotion,
  createCameraState,
  resolveLookAtRequest,
} from '../dist/internal.js';

export const TOLERANCE = 1e-9;
export const START_MS = 1000;

const VIEWPORT = { width: 1600, height: 900 };

export const createView = (fields = {}) => ({
  yaw: 0,
  pitch: 0,
  roll: 0,
  fov: 90,
  fovMode: EnumFovMode.Max,
  position: { x: 0, y: 0, z: 0 },
  ...fields,
});

export const createLimits = (fields = {}) => ({ ...LIBRARY_DEFAULT_LIMITS, ...fields });

export const assertClose = (actual, expected, tolerance = TOLERANCE) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${String(expected)}, got ${String(actual)}`);
};

/**
 * Состояние промиса без ожидания: `'pending'`, если он ещё не разрешился к следующему макрозаданию.
 */
export const settled = (promise) =>
  Promise.race([
    promise,
    new Promise((resolve) => {
      setImmediate(() => {
        resolve('pending');
      });
    }),
  ]);

/**
 * Поворот с настоящей камерой и поддельным вводом: `input` можно менять между вызовами, `frames` считает
 * запросы кадра, `stopInertiaCalls` — сколько раз поворот гасил инерцию. `frameAt(elapsedMs)` рисует кадр
 * через `elapsedMs` после первого кадра поворота и возвращает вид после него.
 */
export const createMotionHarness = ({ view = {}, limits = {} } = {}) => {
  const camera = createCameraState(createView(view), createLimits(limits), VIEWPORT);
  const input = { isActive: false, inertiaYawVelocity: 0, stopInertiaCalls: 0, frames: 0 };
  const motion = createCameraMotion({
    getView: camera.getView,
    setView: camera.setView,
    constrained: camera.constrained,
    yawRange: camera.yawRange,
    isInputActive: () => input.isActive,
    inertiaYawVelocity: () => input.inertiaYawVelocity,
    stopInertia: () => {
      input.inertiaYawVelocity = 0;
      input.stopInertiaCalls += 1;
    },
    requestFrame: () => {
      input.frames += 1;
    },
  });

  const lookAt = (target, options) => motion.start(resolveLookAtRequest(target, options));

  const frameAt = (elapsedMs) => {
    motion.step(START_MS + elapsedMs);

    return camera.getView();
  };

  return { camera, input, motion, lookAt, frameAt };
};
