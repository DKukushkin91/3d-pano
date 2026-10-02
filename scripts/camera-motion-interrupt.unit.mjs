import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertClose,
  createLimits,
  createMotionHarness,
  createView,
  settled,
} from './camera-motion-harness.mjs';

const POINT = { yaw: 40, pitch: 0 };

describe('camera-motion · Прерывание вызовами хоста', () => {
  it('Последний вызов побеждает: первый промис — false, второй поворот без рывка идёт к yaw −60', async () => {
    const { lookAt, frameAt, camera } = createMotionHarness();
    const first = lookAt(POINT);

    frameAt(0);

    const middle = frameAt(450);
    const second = lookAt({ yaw: -60, pitch: 0 });

    assert.equal(await settled(first), false);
    assert.deepEqual(camera.getView(), middle);
    assert.deepEqual(frameAt(1000), middle);
    assert.equal(frameAt(1900).yaw, -60);
    assert.equal(await settled(second), true);
  });

  it('interrupt (ввод или setView) даёт false, камера остаётся там, куда доехала', async () => {
    const { lookAt, frameAt, motion } = createMotionHarness();
    const promise = lookAt(POINT);

    frameAt(0);

    const middle = frameAt(450);

    motion.interrupt();

    assert.equal(await settled(promise), false);
    assert.deepEqual(frameAt(900), middle);
    assert.equal(motion.step(2000), false);
  });

  it('после dispose идущий поворот — false, новые вызовы — сразу false без изменения вида', async () => {
    const { lookAt, frameAt, motion, camera } = createMotionHarness();
    const promise = lookAt(POINT);

    frameAt(0);
    motion.dispose();

    assert.equal(await settled(promise), false);
    assert.equal(await settled(lookAt({ yaw: -60, pitch: 0 }, { durationMs: 0 })), false);
    assert.deepEqual(camera.getView(), createView());
  });
});

describe('camera-motion · Отмена сигналом', () => {
  it('Очистка эффекта: abort() останавливает камеру, промис — false', async () => {
    const controller = new AbortController();
    const { lookAt, frameAt } = createMotionHarness();
    const promise = lookAt(POINT, { signal: controller.signal });

    frameAt(0);

    const middle = frameAt(450);

    controller.abort();

    assert.equal(await settled(promise), false);
    assert.deepEqual(frameAt(900), middle);
  });

  it('Сигнал уже отменён: промис — false, вид не меняется', async () => {
    const controller = new AbortController();
    const { lookAt, camera } = createMotionHarness();

    controller.abort();

    assert.equal(await settled(lookAt(POINT, { signal: controller.signal, durationMs: 0 })), false);
    assert.deepEqual(camera.getView(), createView());
  });

  it('сигнал отменяет только свой поворот, abort() после конца ничего не меняет', async () => {
    const first = new AbortController();
    const { lookAt, frameAt } = createMotionHarness();

    void lookAt(POINT, { signal: first.signal });

    const second = lookAt({ yaw: -60, pitch: 0 });

    frameAt(0);
    first.abort();

    assert.equal(frameAt(900).yaw, -60);
    assert.equal(await settled(second), true);
    first.abort();
  });
});

describe('camera-motion · Ввод в момент вызова', () => {
  it('Вызов во время перетаскивания: промис — false, вид не меняется', async () => {
    const { lookAt, input, camera } = createMotionHarness();

    input.isActive = true;

    assert.equal(await settled(lookAt(POINT, { durationMs: 0 })), false);
    assert.deepEqual(camera.getView(), createView());
  });

  it('Вызов во время инерции: инерция гасится, камера поворачивает к цели', async () => {
    const { lookAt, input, frameAt } = createMotionHarness();

    input.inertiaYawVelocity = 30;

    const promise = lookAt(POINT);

    assert.equal(input.stopInertiaCalls, 1);
    assert.equal(input.inertiaYawVelocity, 0);
    frameAt(0);
    assert.equal(frameAt(900).yaw, 40);
    assert.equal(await settled(promise), true);
  });
});

describe('camera-motion · Путь по горизонтали (текущее вращение)', () => {
  it('Цель сзади во время вращения: инерция влево поворачивает камеру влево', () => {
    const { lookAt, input, frameAt } = createMotionHarness();

    input.inertiaYawVelocity = -30;
    void lookAt({ yaw: 180, pitch: 0 });
    frameAt(0);

    assert.ok(frameAt(300).yaw < 0);
  });

  it('цель ровно сзади прерванного поворота: камера продолжает вращаться в ту же сторону', () => {
    const { lookAt, frameAt } = createMotionHarness();

    void lookAt(POINT);
    frameAt(0);

    const { yaw } = frameAt(450);

    void lookAt({ yaw: yaw + 180, pitch: 0 });
    frameAt(1000);

    assert.ok(frameAt(1300).yaw > yaw);
  });
});

describe('scene-navigation · Инерция при смене (поворот)', () => {
  it('Смена ремонта во время поворота к пину: с keepMotion камера доезжает в срок, промис — true', async () => {
    const { lookAt, frameAt, camera, motion } = createMotionHarness();
    const reference = createMotionHarness();
    const promise = lookAt(POINT);

    void reference.lookAt(POINT);
    frameAt(0);
    reference.frameAt(0);
    frameAt(450);
    reference.frameAt(450);
    camera.resetScene(camera.getView(), createLimits());
    motion.handleSceneChange(true);

    assert.deepEqual(frameAt(600), reference.frameAt(600));
    assert.deepEqual(frameAt(900), createView(POINT));
    assert.equal(await settled(promise), true);
  });

  it('скачок вида при смене гасится к концу: без рывка в момент смены, цель — в срок', () => {
    const { lookAt, frameAt, camera, motion } = createMotionHarness();

    void lookAt(POINT);
    frameAt(0);
    frameAt(450);
    camera.resetScene(createView({ yaw: -20 }), createLimits());
    motion.handleSceneChange(true);

    const afterJump = frameAt(451);

    assert.ok(Math.abs(afterJump.yaw - -20) < 0.5);
    assert.deepEqual(frameAt(900), createView(POINT));
  });

  it('цель проводится через ограничения новой сцены', () => {
    const { lookAt, frameAt, camera, motion } = createMotionHarness();

    void lookAt(POINT, { fov: 100 });
    frameAt(0);
    frameAt(300);
    camera.resetScene(camera.getView(), createLimits({ fov: [30, 80] }));
    motion.handleSceneChange(true);

    assertClose(frameAt(900).fov, 80);
  });

  it('смена до первого кадра: путь начинается от вида новой сцены', () => {
    const { lookAt, frameAt, camera, motion } = createMotionHarness();

    void lookAt(POINT);
    camera.resetScene(createView({ yaw: 20 }), createLimits());
    motion.handleSceneChange(true);

    assert.equal(frameAt(0).yaw, 20);
    assert.equal(frameAt(900).yaw, 40);
  });

  it('Переход в другую комнату: без keepMotion поворот прерывается, промис — false', async () => {
    const { lookAt, frameAt, motion } = createMotionHarness();
    const promise = lookAt(POINT);

    frameAt(0);
    motion.handleSceneChange(false);

    assert.equal(await settled(promise), false);
    assert.equal(motion.step(2000), false);
  });
});
