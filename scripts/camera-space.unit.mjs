import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { LIBRARY_DEFAULT_LIMITS, createCameraState, sceneModelOf } from '../dist/internal.js';

const VIEWPORT = { width: 1000, height: 1000 };
const VIEW = { yaw: 0, pitch: 0, roll: 0, fov: 90, fovMode: 'max', position: { x: 0, y: 0, z: 0 } };
const STEP_SPACE = { offset: { x: 0, y: 0, z: 1 }, model: sceneModelOf(1.5) };
const HALF_PIXEL = 0.5;

const createCamera = (view = VIEW) => createCameraState(view, LIBRARY_DEFAULT_LIMITS, VIEWPORT);

describe('scene-space · Позиция камеры в виде', () => {
  it('Вне перехода: position — нули', () => {
    assert.deepEqual(createCamera().getView().position, { x: 0, y: 0, z: 0 });
  });

  it('Во время шага: position — сдвиг из пространства, его изменение — изменение вида', () => {
    const camera = createCamera();

    camera.takeViewChange();
    camera.setSpace(STEP_SPACE);

    assert.deepEqual(camera.getView().position, { x: 0, y: 0, z: 1 });
    assert.deepEqual(camera.takeViewChange()?.position, { x: 0, y: 0, z: 1 });

    camera.setSpace(STEP_SPACE);
    assert.equal(camera.takeViewChange(), null);

    camera.setSpace(null);
    assert.deepEqual(camera.takeViewChange()?.position, { x: 0, y: 0, z: 0 });
  });

  it('setView меняет углы, но не позицию', () => {
    const camera = createCamera();

    camera.setSpace(STEP_SPACE);
    camera.setView({ yaw: 30, position: { x: 5, y: 5, z: 5 } });

    assert.equal(camera.getView().yaw, 30);
    assert.deepEqual(camera.getView().position, { x: 0, y: 0, z: 1 });
  });

  it('кадр отрисовки несёт пространство сцены', () => {
    const camera = createCamera();

    assert.equal(camera.frameCamera()?.space, undefined);
    camera.setSpace(STEP_SPACE);
    assert.equal(camera.frameCamera()?.space, STEP_SPACE);
  });
});

describe('camera-view · Точка на экране (сдвиг камеры)', () => {
  it('Точка мира во время шага: видна из камеры — ниже, чем из центра сцены', () => {
    const camera = createCamera();
    const fromCentre = camera.project({ x: 0, y: -1.5, z: 3 });

    camera.setSpace(STEP_SPACE);

    const fromCamera = camera.project({ x: 0, y: -1.5, z: 3 });

    assert.ok(Math.abs(fromCentre.y - 750) < 1e-6);
    assert.ok(Math.abs(fromCamera.y - 875) < 1e-6);
  });

  it('точка сферы лежит на модели: под горизонтом — на полу и двигается вместе с ним', () => {
    const camera = createCamera();

    camera.setSpace(STEP_SPACE);

    const sphere = camera.project({ yaw: 0, pitch: -26.56505117707799 });
    const floor = camera.project({ x: 0, y: -1.5, z: 3 });

    assert.ok(Math.abs(sphere.x - floor.x) < 1e-6 && Math.abs(sphere.y - floor.y) < 1e-6);
  });

  it('без сдвига точка мира — только направление', () => {
    const camera = createCamera();
    const near = camera.project({ x: 0, y: -1.5, z: 3 });
    const far = camera.project({ x: 0, y: -3, z: 6 });

    assert.deepEqual(near, far);
  });
});

describe('camera-view · Точка сферы под пикселем (сдвиг камеры)', () => {
  it('Клик во время шага: направление из центра на точку пола, project возвращает исходный пиксель', () => {
    const camera = createCamera();

    camera.setSpace(STEP_SPACE);

    const point = camera.unproject(500, 875);

    assert.ok(Math.abs(point.yaw) < 1e-9);
    assert.ok(Math.abs(point.pitch + 26.56505117707799) < 1e-9);

    const back = camera.project(point);

    assert.ok(Math.abs(back.x - 500) < HALF_PIXEL && Math.abs(back.y - 875) < HALF_PIXEL);
  });

  it('project(unproject()) со сдвигом совпадает с пикселем по всему кадру', () => {
    const camera = createCamera({ ...VIEW, yaw: 40, pitch: -25 });

    camera.setSpace({ offset: { x: 0.4, y: 0, z: -1.2 }, model: sceneModelOf(1.5, 1.3) });

    for (const x of [0, 137, 500, 812, 1000]) {
      for (const y of [0, 250, 500, 733, 1000]) {
        const back = camera.project(camera.unproject(x, y));

        assert.ok(
          Math.abs(back.x - x) < HALF_PIXEL && Math.abs(back.y - y) < HALF_PIXEL,
          `${String(x)}, ${String(y)}`,
        );
      }
    }
  });
});
