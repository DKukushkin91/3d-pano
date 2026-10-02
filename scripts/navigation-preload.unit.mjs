import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TOUR, createHarness, flush, notFound } from './navigation-harness.mjs';
import { rejectionOf } from './test-helpers.mjs';

const SECOND_TOUR = {
  defaults: { limits: { fov: [50, 100] } },
  scenes: [TOUR.scenes[1], TOUR.scenes[0]],
};

describe('scene-navigation · Предзагрузка сцены', () => {
  it('Мгновенный переход после предзагрузки: новых сессий нет, смена сразу', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');

    const preloaded = harness.navigator.preloadScene('bedroom');

    assert.equal(harness.latestSession('bedroom').withPreview, false);
    await harness.complete('bedroom');
    assert.equal(await preloaded, true);

    const shown = harness.navigator.showScene('bedroom');

    assert.equal(harness.sessionsOf('bedroom').length, 1);
    assert.equal(harness.navigator.frame(0).current, harness.latestSession('bedroom'));
    assert.equal(await shown, true);
  });

  it('Смена во время предзагрузки: начатая загрузка подхватывается, оба промиса true', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');

    const preloaded = harness.navigator.preloadScene('bedroom');
    const shown = harness.navigator.showScene('bedroom');

    assert.equal(harness.sessionsOf('bedroom').length, 1);
    assert.equal(harness.latestSession('bedroom').loads, 1);
    await harness.complete('bedroom');

    assert.equal(await shown, true);
    assert.equal(await preloaded, true);
    assert.equal(harness.navigator.frame(0).current, harness.latestSession('bedroom'));
  });

  it('предзагрузка сцены на экране и сцены из кэша сразу даёт true без загрузки', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');

    assert.equal(await harness.navigator.preloadScene('kitchen'), true);
    assert.equal(harness.sessions.length, 1);
  });

  it('предзагрузка сцены, которая сейчас грузится как переходная, ждёт её загрузки', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');

    const shown = harness.navigator.showScene('bedroom');
    const preloaded = harness.navigator.preloadScene('bedroom');

    await harness.complete('bedroom');

    assert.equal(await shown, true);
    assert.equal(await preloaded, true);
    assert.equal(harness.sessionsOf('bedroom').length, 1);
  });

  it('при бюджете 0 предзагрузка сразу даёт false без запросов', async () => {
    const harness = createHarness({ cacheMegabytes: 0 });

    await harness.startAt('kitchen');

    assert.equal(await harness.navigator.preloadScene('bedroom'), false);
    assert.equal(harness.sessionsOf('bedroom').length, 0);
  });

  it('неизвестная сцена отклоняет предзагрузку с кодом unknown-scene', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');

    assert.equal((await rejectionOf(harness.navigator.preloadScene('attic'))).details.code, 'unknown-scene');
  });
});

describe('scene-navigation · Предзагрузка в фоне', () => {
  it('Соседняя комната с ошибкой: отклоняется только промис, снимок и события не меняются', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');

    const before = harness.snapshot();
    const failure = rejectionOf(harness.navigator.preloadScene('hall'));

    await harness.fail('hall', notFound('https://cdn.example.com/hall.jpg'));

    assert.equal((await failure).details.code, 'http-status');
    assert.equal(harness.snapshot(), before);
    assert.deepEqual(harness.events, []);
    assert.equal(harness.latestSession('hall').isDisposed, true);
  });

  it('Текущая сцена важнее: предзагрузки стартуют после готовности сцены, по одной', async () => {
    const harness = createHarness();
    const shown = harness.navigator.setTour(TOUR, { scene: 'kitchen' });

    void harness.navigator.preloadScene('bedroom');
    void harness.navigator.preloadScene('hall');

    assert.equal(harness.sessions.length, 1);
    await harness.complete('kitchen');
    await shown;

    assert.deepEqual(
      harness.sessions.map((session) => session.scene.id),
      ['kitchen', 'bedroom'],
    );
    await harness.complete('bedroom');
    assert.deepEqual(
      harness.sessions.map((session) => session.scene.id),
      ['kitchen', 'bedroom', 'hall'],
    );
  });
});

describe('scene-navigation · Кэш сцен в видеопамяти', () => {
  it('Возврат в прошлую комнату: kitchen показывается без новой сессии', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');
    void harness.navigator.showScene('bedroom');
    await harness.complete('bedroom');
    await harness.navigator.showScene('kitchen');

    assert.equal(harness.sessionsOf('kitchen').length, 1);
  });

  it('Освободить видеопамять: бюджет 0 освобождает всё, кроме сцены на экране', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');
    void harness.navigator.showScene('bedroom');
    await harness.complete('bedroom');
    harness.navigator.setCacheBudget(0);

    assert.equal(harness.latestSession('kitchen').isDisposed, true);
    assert.equal(harness.latestSession('bedroom').isDisposed, false);
  });
});

describe('scene-navigation · Замена тура', () => {
  it('Новый вариант планировки: та же сцена не перезагружается, вид сохраняется, ограничения новые', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');

    const appearancesBefore = harness.appearances.length;
    const replaced = await harness.navigator.setTour(SECOND_TOUR, { scene: 'kitchen', view: 'keep' });

    assert.equal(replaced, true);
    assert.equal(harness.sessions.length, 1);
    assert.equal(harness.appearances.length, appearancesBefore);
    assert.deepEqual(harness.appliedLimits.at(-1).fov, [50, 100]);
    assert.equal(
      harness.refreshes.at(-1).scene,
      SECOND_TOUR.scenes.find((scene) => scene.id === 'kitchen'),
    );
    assert.deepEqual(harness.events, []);
  });

  it('без options.scene показывается startScene нового тура, иначе первая сцена', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');

    const replaced = harness.navigator.setTour({ ...SECOND_TOUR, startScene: 'kitchen' });

    assert.equal(await replaced, true);

    void harness.navigator.setTour(SECOND_TOUR);
    assert.equal(harness.snapshot().sceneId, 'bedroom');
  });

  it('Предзагрузка исчезнувшей сцены: промис false, сессия освобождена', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');

    const preloaded = harness.navigator.preloadScene('hall');

    await flush();
    await harness.navigator.setTour(SECOND_TOUR, { scene: 'kitchen' });

    assert.equal(await preloaded, false);
    assert.equal(harness.latestSession('hall').isDisposed, true);
  });

  it('Сломанный тур с сервера при работающем просмотрщике: invalid-tour, ничего не меняется', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');

    const before = harness.snapshot();
    const error = await rejectionOf(harness.navigator.setTour({ scenes: [] }));

    assert.equal(error.details.code, 'invalid-tour');
    assert.ok(error.details.issues.length > 0);
    assert.equal(harness.snapshot(), before);
    void harness.navigator.showScene('hall');
    assert.equal(harness.snapshot().sceneId, 'hall');
  });

  it('неизвестная options.scene в новом туре — unknown-scene, тур не меняется', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');

    const error = await rejectionOf(harness.navigator.setTour(SECOND_TOUR, { scene: 'attic' }));

    assert.equal(error.details.code, 'unknown-scene');
    void harness.navigator.showScene('hall');
    assert.equal(harness.snapshot().sceneId, 'hall');
  });
});
