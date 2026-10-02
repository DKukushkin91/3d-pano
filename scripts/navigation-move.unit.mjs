import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EnumTransitionType, resolveEasing, resolveShowSceneOptions } from '../dist/internal.js';
import { createHarness } from './navigation-harness.mjs';

const EPSILON = 1e-9;
const QUAD_OUT = resolveEasing('quad-out');
const MOVE_TO_FLOOR_POINT = { transition: { type: 'move', point: { x: 0, y: -1.5, z: 2 } } };

const INVALID_MOVES = [
  { option: 'blur', transition: { type: 'move', blur: 2 } },
  { option: 'blur', transition: { type: 'move', blur: -0.1 } },
  { option: 'point', transition: { type: 'move', point: { x: 0, y: 0, z: 0 } } },
  { option: 'point', transition: { type: 'move', point: { yaw: Number.NaN, pitch: 0 } } },
  { option: 'turn', transition: { type: 'move', turn: Number.POSITIVE_INFINITY } },
];

const equirect = (name) => ({ type: 'equirect', url: `https://cdn.example.com/${name}.jpg` });

const WORLD_TOUR = {
  defaults: { cameraHeight: 1.5 },
  scenes: [
    { id: 'kitchen', source: equirect('kitchen'), heading: 0 },
    { id: 'hall', source: equirect('hall'), heading: 45 },
    { id: 'bedroom', source: equirect('bedroom'), heading: 90 },
    { id: 'pantry', source: equirect('pantry') },
  ],
};

const startIn = async (harness, sceneId) => {
  const shown = harness.navigator.setTour(WORLD_TOUR, { scene: sceneId });

  await harness.complete(sceneId);
  await shown;
};

const lookAt = (harness, yaw) => {
  harness.camera.view = { ...harness.camera.view, yaw };
};

describe('scene-transitions · Переход «шаг» (опции)', () => {
  it('Шаг по умолчанию: 500 мс, quad-out, размытие 0.5, вид keep', () => {
    const resolved = resolveShowSceneOptions({ transition: { type: 'move' } });

    assert.equal(resolved.transition.type, EnumTransitionType.Move);
    assert.equal(resolved.transition.durationMs, 500);
    assert.equal(resolved.transition.easing(0.5), QUAD_OUT(0.5));
    assert.deepEqual(resolved.transition.move, { point: null, turn: null, blur: 0.5 });
    assert.equal(resolved.view, 'keep');
  });

  it('durationMs: 0 равнозначен cut; явный view сильнее умолчания keep', () => {
    assert.equal(
      resolveShowSceneOptions({ transition: { type: 'move', durationMs: 0 } }).transition.type,
      'cut',
    );
    assert.equal(resolveShowSceneOptions({ transition: { type: 'move' }, view: 'scene' }).view, 'scene');
  });

  it('точка и доворот копируются, blur 0 допустим', () => {
    const point = { yaw: 30, pitch: -40 };
    const resolved = resolveShowSceneOptions({ transition: { type: 'move', point, turn: -30, blur: 0 } });

    assert.deepEqual(resolved.transition.move, { point: { yaw: 30, pitch: -40 }, turn: -30, blur: 0 });
    assert.notEqual(resolved.transition.move.point, point);
  });

  for (const { option, transition } of INVALID_MOVES) {
    it(`неверный ${option} шага — RangeError с 3d-pano: и именем опции`, () => {
      assert.throws(() => resolveShowSceneOptions({ transition }), {
        name: 'RangeError',
        message: new RegExp(`^3d-pano: .*${option}`, 'u'),
      });
    });
  }
});

describe('scene-navigation · Вид после смены (доворот)', () => {
  it('Смешивание между комнатами с разным heading: keep сохраняет направление в мире', async () => {
    const harness = createHarness();

    await startIn(harness, 'kitchen');
    lookAt(harness, 45);
    void harness.navigator.showScene('hall', {
      view: 'keep',
      transition: { type: 'blend', durationMs: 300 },
    });

    assert.equal(harness.latestSession('hall').targets[0].view.yaw, 0);
    await harness.complete('hall');

    assert.equal(harness.appearances.at(-1).view.yaw, 0);
    assert.equal(harness.navigator.frame(0).previousYawShift, 45);
  });

  it('без heading доворота нет, а вид scene от heading не зависит', async () => {
    const harness = createHarness();

    await startIn(harness, 'kitchen');
    lookAt(harness, 120);
    void harness.navigator.showScene('pantry', { view: 'keep' });
    await harness.complete('pantry');
    assert.equal(harness.appearances.at(-1).view.yaw, 120);

    void harness.navigator.showScene('bedroom');
    await harness.complete('bedroom');
    assert.equal(harness.appearances.at(-1).view.yaw, 0);
  });

  it('Комнаты с разным heading: после шага yaw 90 кухни становится yaw 0 спальни', async () => {
    const harness = createHarness();

    await startIn(harness, 'kitchen');
    lookAt(harness, 90);
    void harness.navigator.showScene('bedroom', { transition: { type: 'move' } });
    await harness.complete('bedroom');

    assert.equal(harness.appearances.at(-1).view.yaw, 0);
    assert.equal(harness.navigator.frame(0).previousYawShift, 90);
  });
});

describe('scene-transitions · Переход «шаг» (кадры навигатора)', () => {
  it('Середина шага: сдвиги обеих сцен и вес по quad-out, промис — после конца шага', async () => {
    const harness = createHarness();

    await startIn(harness, 'kitchen');

    let isShown = false;
    const shown = harness.navigator.showScene('pantry', MOVE_TO_FLOOR_POINT).then((value) => {
      isShown = value;
    });

    await harness.complete('pantry');

    const first = harness.navigator.frame(1000);

    assert.equal(first.move.previous.offset.z, 0);
    assert.ok(Math.abs(first.move.current.offset.z + 2) < EPSILON);

    const middle = harness.navigator.frame(1250);
    const eased = QUAD_OUT(0.5);

    assert.ok(Math.abs(middle.move.previous.offset.z - 2 * eased) < EPSILON);
    assert.ok(Math.abs(middle.move.current.offset.z - (2 * eased - 2)) < EPSILON);
    assert.ok(Math.abs(middle.weight - eased) < EPSILON);
    assert.ok(middle.move.blurStrength > 0.49);
    assert.equal(harness.snapshot().isTransitioning, true);
    assert.equal(isShown, false);

    const last = harness.navigator.frame(1500);

    await shown;
    assert.equal(last.move, null);
    assert.equal(last.previous, null);
    assert.equal(harness.snapshot().isTransitioning, false);
    assert.equal(isShown, true);
  });

  it('модели сцен в кадре шага — пол на высоте камеры тура', async () => {
    const harness = createHarness();

    await startIn(harness, 'kitchen');
    void harness.navigator.showScene('pantry', MOVE_TO_FLOOR_POINT);
    await harness.complete('pantry');

    const frame = harness.navigator.frame(0);

    assert.equal(frame.move.previous.model.floorDepth, 1.5);
    assert.equal(frame.move.current.model.floorDepth, 1.5);
    assert.deepEqual(frame.move.target, { x: 0, y: 0, z: 2 });
  });

  it('новый showScene во время шага: прежний промис false, шаг идёт до появления новой сцены', async () => {
    const harness = createHarness();

    await startIn(harness, 'kitchen');

    const moved = harness.navigator.showScene('pantry', MOVE_TO_FLOOR_POINT);

    await harness.complete('pantry');
    harness.navigator.frame(1000);
    void harness.navigator.showScene('hall');

    assert.equal(await moved, false);
    assert.notEqual(harness.navigator.frame(1100).move, null);

    await harness.complete('hall');
    assert.equal(harness.navigator.frame(1200).move, null);
  });

  it('cut и blend шага не дают', async () => {
    const harness = createHarness();

    await startIn(harness, 'kitchen');
    void harness.navigator.showScene('pantry', { transition: { type: 'blend', durationMs: 300 } });
    await harness.complete('pantry');

    assert.equal(harness.navigator.frame(0).move, null);
  });
});
