import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { READY_DENSITY, TOUR, createHarness, flush, networkFailure } from './navigation-harness.mjs';
import { rejectionOf } from './test-helpers.mjs';

const BLEND_300 = { transition: { type: 'blend', durationMs: 300 } };

describe('scene-navigation · Переключение сцены', () => {
  it('Переход в соседнюю комнату: после загрузки на экране bedroom, промис разрешается true', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');

    const shown = harness.navigator.showScene('bedroom');

    await harness.complete('bedroom');

    assert.equal(await shown, true);
    assert.equal(harness.navigator.frame(0).current, harness.latestSession('bedroom'));
    assert.equal(harness.snapshot().status, 'ready');
  });

  it('стартовая сцена появляется сразу, с превью и стартовым видом тура', async () => {
    const harness = createHarness();
    const shown = harness.navigator.setTour(TOUR);
    const kitchen = harness.latestSession('kitchen');

    assert.equal(kitchen.withPreview, true);
    assert.equal(harness.navigator.frame(0).current, kitchen);
    assert.equal(harness.appearances[0].view.yaw, 10);
    assert.deepEqual(harness.appearances[0].limits.fov, [40, 110]);
    assert.equal(harness.snapshot().isTransitioning, false);

    await harness.complete('kitchen');

    assert.equal(await shown, true);
    assert.deepEqual(harness.eventNames(), ['sceneChange', 'sceneLoadStart', 'sceneReady']);
    assert.deepEqual(harness.events[0], { name: 'sceneChange', sceneId: 'kitchen', previousSceneId: null });
    assert.equal(harness.densities.at(-1), READY_DENSITY);
  });
});

describe('scene-navigation · Старая сцена до готовности новой', () => {
  it('Медленная сеть: пока bedroom грузится, на экране kitchen, превью bedroom не запрашивается', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');
    void harness.navigator.showScene('bedroom');

    assert.equal(harness.latestSession('bedroom').withPreview, false);
    assert.equal(harness.navigator.frame(0).current, harness.latestSession('kitchen'));
    assert.equal(harness.appearances.length, 1);
  });
});

describe('viewer-state-events · Снимок и события при смене', () => {
  it('Полоса загрузки при смене комнаты: sceneId сразу bedroom, статус loading и растущий прогресс', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');
    void harness.navigator.showScene('bedroom');
    harness.latestSession('bedroom').progress(0.4);

    assert.equal(harness.snapshot().sceneId, 'bedroom');
    assert.equal(harness.snapshot().status, 'loading');
    assert.equal(harness.snapshot().loadProgress, 0.4);
  });

  it('подписчик не видит промежуточных снимков: sceneId, статус и isTransitioning меняются вместе', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');

    const seen = [];

    harness.store.subscribe(() => {
      const { sceneId, status, isTransitioning } = harness.snapshot();

      seen.push(`${sceneId}/${status}/${String(isTransitioning)}`);
    });
    void harness.navigator.showScene('bedroom');
    await harness.complete('bedroom');

    assert.deepEqual(seen, ['bedroom/loading/true', 'bedroom/ready/true', 'bedroom/ready/false']);
  });

  it('Подсветка комнаты в списке хоста: sceneChange в момент вызова с previousSceneId', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');
    void harness.navigator.showScene('bedroom');

    assert.deepEqual(harness.events[0], {
      name: 'sceneChange',
      sceneId: 'bedroom',
      previousSceneId: 'kitchen',
    });
    assert.deepEqual(harness.eventNames(), ['sceneChange', 'sceneLoadStart']);
  });

  it('Сцена из кэша: sceneLoadStart и сразу sceneReady, новых сессий нет', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');
    void harness.navigator.showScene('bedroom');
    await harness.complete('bedroom');
    harness.events.length = 0;

    const shown = harness.navigator.showScene('kitchen');

    assert.deepEqual(harness.eventNames(), ['sceneChange', 'sceneLoadStart', 'sceneReady']);
    assert.equal(harness.sessionsOf('kitchen').length, 1);
    assert.equal(await shown, true);
  });
});

describe('scene-transitions · Смешивание и состояние перехода', () => {
  it('Блокировка кнопок хоста: isTransitioning true до конца смешивания', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');

    const shown = harness.navigator.showScene('bedroom', BLEND_300);

    assert.equal(harness.snapshot().isTransitioning, true);
    await harness.complete('bedroom');

    const firstFrame = harness.navigator.frame(1000);

    assert.equal(firstFrame.previous, harness.latestSession('kitchen'));
    assert.equal(firstFrame.weight, 0);
    assert.ok(Math.abs(harness.navigator.frame(1150).weight - 0.5) < 1e-9);
    assert.equal(harness.snapshot().isTransitioning, true);

    const lastFrame = harness.navigator.frame(1300);

    assert.equal(lastFrame.previous, null);
    assert.equal(harness.snapshot().isTransitioning, false);
    assert.equal(await shown, true);
  });

  it('при view: scene старая сцена замирает в последнем виде, при keep — живая камера', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');
    harness.camera.view = { ...harness.camera.view, yaw: 120 };
    void harness.navigator.showScene('bedroom', BLEND_300);
    await harness.complete('bedroom');

    assert.equal(harness.navigator.frame(0).previousView.yaw, 120);
    assert.equal(harness.appearances.at(-1).view.yaw, 30);

    void harness.navigator.showScene('kitchen', { ...BLEND_300, view: 'keep', keepMotion: true });

    assert.equal(harness.navigator.frame(10).previousView, null);
    assert.equal(harness.appearances.at(-1).keepMotion, true);
    assert.equal(harness.appearances.at(-1).view.yaw, 30);
  });
});

describe('scene-navigation · Последний вызов побеждает', () => {
  it('Быстрые клики по комнатам: первый промис false, второй true, bedroom не появляется', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');

    const toBedroom = harness.navigator.showScene('bedroom');
    const toHall = harness.navigator.showScene('hall');

    assert.equal(await toBedroom, false);
    assert.equal(harness.latestSession('bedroom').isDisposed, true);
    await harness.complete('hall');
    assert.equal(await toHall, true);
    assert.ok(harness.appearances.every((appearance) => appearance.view.yaw !== 30));
  });

  it('повторный вызов той же сцены во время загрузки не перезапускает её', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');

    const first = harness.navigator.showScene('bedroom');
    const second = harness.navigator.showScene('bedroom', { view: 'keep' });

    assert.equal(await first, false);
    assert.equal(harness.sessionsOf('bedroom').length, 1);
    await harness.complete('bedroom');
    assert.equal(await second, true);
  });

  it('Уничтожение во время смены: промис false, исключений нет', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');

    const shown = harness.navigator.showScene('bedroom');

    harness.navigator.destroy();

    assert.equal(await shown, false);
    assert.equal(harness.latestSession('kitchen').isDisposed, true);
    assert.equal(await harness.navigator.showScene('hall'), false);
  });
});

describe('scene-navigation · Сцена уже на экране и неизвестная сцена', () => {
  it('Передумал уходить: смена на bedroom перебита, снимок снова kitchen и ready', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');

    const toBedroom = harness.navigator.showScene('bedroom');
    const back = harness.navigator.showScene('kitchen');

    assert.equal(await toBedroom, false);
    assert.equal(await back, true);
    assert.equal(harness.snapshot().sceneId, 'kitchen');
    assert.equal(harness.snapshot().status, 'ready');
    assert.equal(harness.snapshot().isTransitioning, false);
    assert.deepEqual(harness.events.at(-1), {
      name: 'sceneChange',
      sceneId: 'kitchen',
      previousSceneId: 'bedroom',
    });
  });

  it('Опечатка в id: отклонение unknown-scene, снимок и события не меняются', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');

    const before = harness.snapshot();
    const error = await rejectionOf(harness.navigator.showScene('kitchn'));

    assert.equal(error.details.code, 'unknown-scene');
    assert.equal(error.details.category, 'tour');
    assert.equal(harness.snapshot(), before);
    assert.deepEqual(harness.events, []);
  });

  it('неверные опции бросают RangeError синхронно', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');

    assert.throws(
      () => harness.navigator.showScene('bedroom', { transition: { type: 'blend', durationMs: -1 } }),
      RangeError,
    );
  });
});

describe('scene-navigation · Ошибка загрузки при смене', () => {
  it('Обрыв сети при смене комнаты: kitchen на экране, ошибка в снимке, retry доводит переход', async () => {
    const harness = createHarness();

    await harness.startAt('kitchen');

    const shown = harness.navigator.showScene('bedroom');
    const failure = rejectionOf(shown);

    await harness.fail('bedroom', networkFailure('https://cdn.example.com/bedroom.jpg'));

    assert.equal((await failure).details.code, 'network-failed');
    assert.equal(harness.snapshot().sceneId, 'bedroom');
    assert.equal(harness.snapshot().status, 'error');
    assert.equal(harness.snapshot().isTransitioning, false);
    assert.equal(harness.navigator.frame(0).current, harness.latestSession('kitchen'));
    assert.deepEqual(harness.eventNames().at(-1), 'error');

    const retried = harness.navigator.retry();

    assert.equal(harness.snapshot().isTransitioning, true);
    assert.equal(harness.snapshot().error, null);
    harness.latestSession('bedroom').complete();
    await retried;
    await flush();

    assert.equal(harness.latestSession('bedroom').loads, 2);
    assert.equal(harness.navigator.frame(0).current, harness.latestSession('bedroom'));
    assert.equal(harness.snapshot().status, 'ready');
  });
});
