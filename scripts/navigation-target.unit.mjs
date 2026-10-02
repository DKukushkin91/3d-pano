import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createHarness, flush } from './navigation-harness.mjs';

const WINDOW_VIEW = { yaw: 120, pitch: 0, roll: 0, fov: 90, fovMode: 'max' };

describe('multiresolution · Готовность тайловой сцены (кадр появления в навигаторе)', () => {
  it('Смена ремонта: с view keep сцена готовится для текущего вида на момент вызова', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');
    harness.camera.view = WINDOW_VIEW;
    void harness.navigator.showScene('bedroom', { view: 'keep' });

    const [target] = harness.latestSession('bedroom').targets;

    assert.equal(target.view.yaw, 120);
    assert.deepEqual(target.limits.fov, [40, 110]);
    assert.equal(target.isPreload, false);
  });

  it('без view кадр готовности — стартовый вид сцены, объект вида — поверх него', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');
    void harness.navigator.showScene('bedroom');
    assert.equal(harness.latestSession('bedroom').targets[0].view.yaw, 30);

    void harness.navigator.showScene('hall', { view: { yaw: 200 } });
    assert.equal(harness.latestSession('hall').targets[0].view.yaw, 200);
  });

  it('сессия в кэше, готовая для другого вида, догружается, а не показывается сразу', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');

    const kitchen = harness.latestSession('kitchen');

    kitchen.readyFor = (target) => target.view.yaw === 10;
    void harness.navigator.showScene('bedroom');
    await harness.complete('bedroom');

    const shown = harness.navigator.showScene('kitchen', { view: { yaw: 200 } });

    await flush();

    assert.equal(kitchen.loads, 2);
    assert.equal(harness.snapshot().status, 'loading');
    assert.equal(harness.navigator.frame(0).current, harness.latestSession('bedroom'));

    kitchen.complete();
    assert.equal(await shown, true);
    assert.equal(harness.navigator.frame(0).current, kitchen);
  });

  it('сессия в кэше, готовая для этого вида, показывается без загрузки', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');

    const kitchen = harness.latestSession('kitchen');

    kitchen.readyFor = (target) => target.view.yaw === 10;
    void harness.navigator.showScene('bedroom');
    await harness.complete('bedroom');

    assert.equal(await harness.navigator.showScene('kitchen'), true);
    assert.equal(kitchen.loads, 1);
  });

  it('предзагрузка готовит стартовый вид сцены и помечена как предзагрузка', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');
    harness.navigator.preloadScene('hall').catch(() => undefined);
    await flush();

    const [target] = harness.latestSession('hall').targets;

    assert.equal(target.isPreload, true);
    assert.equal(target.view.yaw, 0);
  });

  it('смена, забравшая предзагрузку, зовёт load со своим кадром, загрузка не начинается заново', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');
    harness.navigator.preloadScene('hall').catch(() => undefined);
    await flush();
    harness.camera.view = WINDOW_VIEW;
    void harness.navigator.showScene('hall', { view: 'keep' });

    const hall = harness.latestSession('hall');

    assert.equal(hall.loads, 1);
    assert.deepEqual(
      hall.targets.map((target) => [target.view.yaw, target.isPreload]),
      [
        [0, true],
        [120, false],
      ],
    );
  });

  it('retry после ошибки повторяет загрузку с тем же кадром', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');
    harness.camera.view = WINDOW_VIEW;
    harness.navigator.showScene('bedroom', { view: 'keep' }).catch(() => undefined);
    harness.camera.view = { ...WINDOW_VIEW, yaw: 0 };
    await harness.fail('bedroom', new Error('offline'));
    harness.navigator.retry().catch(() => undefined);

    assert.deepEqual(
      harness.latestSession('bedroom').targets.map((target) => target.view.yaw),
      [120, 120],
    );
  });
});
