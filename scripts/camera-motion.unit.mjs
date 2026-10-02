import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveEasing } from '../dist/internal.js';
import { assertClose, createMotionHarness, createView, settled } from './camera-motion-harness.mjs';

const POINT = { yaw: 40, pitch: -10 };
const CUBIC_OUT_AT_HALF = 0.875;

describe('camera-motion · Плавный поворот к цели', () => {
  it('Поворот по умолчанию: за 900 мс по cubic-out к yaw 40, pitch −10, промис — true', async () => {
    const { lookAt, frameAt, motion } = createMotionHarness();
    const promise = lookAt(POINT);

    assert.deepEqual(frameAt(0), createView());

    const middle = frameAt(450);

    assertClose(middle.yaw, 40 * CUBIC_OUT_AT_HALF);
    assertClose(middle.pitch, -10 * CUBIC_OUT_AT_HALF);
    assert.equal(await settled(promise), 'pending');
    assert.deepEqual(frameAt(900), createView(POINT));
    assert.equal(await settled(promise), true);
    assert.equal(motion.step(2000), false);
  });

  it('время идёт с первого кадра: задержка до первого кадра не съедает начало пути', () => {
    const { lookAt, motion, camera } = createMotionHarness();

    void lookAt(POINT);
    motion.step(5000);
    motion.step(5450);

    assertClose(camera.getView().yaw, 40 * CUBIC_OUT_AT_HALF);
  });

  it('Своя длительность и плавность: 300 мс по sine-in-out', async () => {
    const { lookAt, frameAt } = createMotionHarness();
    const promise = lookAt({ yaw: 40, pitch: 0 }, { durationMs: 300, easing: 'sine-in-out' });

    frameAt(0);

    assertClose(frameAt(75).yaw, 40 * resolveEasing('sine-in-out')(0.25));
    assertClose(frameAt(150).yaw, 20);
    assert.equal(frameAt(300).yaw, 40);
    assert.equal(await settled(promise), true);
  });

  it('пока идёт поворот, кадр просит следующий кадр', () => {
    const { lookAt, motion, input } = createMotionHarness();

    void lookAt(POINT);

    assert.equal(input.frames, 1);
    assert.equal(motion.step(1000), true);
    assert.equal(motion.step(1500), true);
    assert.equal(motion.step(1900), false);
  });
});

describe('camera-motion · Поля вида при повороте', () => {
  it('Приближение к товару: yaw и fov проходят одну долю пути и приходят к цели в один кадр', () => {
    const { lookAt, frameAt } = createMotionHarness();

    void lookAt({ yaw: 40, pitch: 0 }, { fov: 60 });
    frameAt(0);

    const middle = frameAt(450);

    assertClose(middle.yaw / 40, (90 - middle.fov) / 30);

    const beforeEnd = frameAt(899);

    assert.ok(beforeEnd.yaw < 40 && beforeEnd.fov > 60);
    assert.deepEqual(frameAt(900), createView({ yaw: 40, fov: 60 }));
  });

  it('Крен не меняется: roll 5 во время и после поворота', () => {
    const { lookAt, frameAt } = createMotionHarness({ view: { roll: 5 } });

    void lookAt(POINT);

    assert.deepEqual([frameAt(0).roll, frameAt(450).roll, frameAt(900).roll], [5, 5, 5]);
  });

  it('без опции fov поле обзора остаётся прежним', () => {
    const { lookAt, frameAt } = createMotionHarness({ view: { fov: 70 } });

    void lookAt(POINT);
    frameAt(0);

    assert.equal(frameAt(450).fov, 70);
  });
});

describe('camera-motion · Мгновенный поворот', () => {
  it('Нулевая длительность: вид меняется сразу, промис — true', async () => {
    const { lookAt, camera } = createMotionHarness();
    const promise = lookAt({ yaw: 40, pitch: 0 }, { durationMs: 0 });

    assert.equal(camera.getView().yaw, 40);
    assert.equal(await settled(promise), true);
  });

  it('Уже на месте: промис — true без кадров анимации', async () => {
    const { lookAt, motion } = createMotionHarness({ view: { yaw: 40 } });
    const promise = lookAt({ yaw: 40, pitch: 0 });

    assert.equal(await settled(promise), true);
    assert.equal(motion.step(1000), false);
  });
});

describe('camera-motion · Ограничения обзора при повороте', () => {
  it('FOV меньше минимума: камера плавно приезжает к fov 30 без остановки на границе', async () => {
    const { lookAt, frameAt } = createMotionHarness({ limits: { fov: [30, 120] } });
    const promise = lookAt({ yaw: 40, pitch: 0 }, { fov: 20 });

    frameAt(0);

    assertClose(frameAt(450).fov, 90 - 60 * CUBIC_OUT_AT_HALF);
    assert.ok(frameAt(800).fov > 30);
    assert.equal(frameAt(900).fov, 30);
    assert.equal(await settled(promise), true);
  });

  it('Перелёт у границы: при back-out камера не выходит за диапазон pitch и в конце стоит на границе', () => {
    const { lookAt, frameAt, camera } = createMotionHarness({ limits: { bounds: { pitch: [-60, 60] } } });
    const boundary = camera.constrained(createView({ pitch: -89 })).pitch;
    const pitches = [];

    void lookAt({ yaw: 0, pitch: -89 }, { easing: 'back-out' });

    for (let elapsedMs = 0; elapsedMs <= 900; elapsedMs += 50) {
      pitches.push(frameAt(elapsedMs).pitch);
    }

    assert.ok(boundary > -60);
    assert.ok(pitches.every((pitch) => pitch >= boundary - 1e-9));
    assert.equal(pitches.at(-1), boundary);
  });
});
