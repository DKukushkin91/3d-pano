import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createPreloadQueue,
  createSceneCache,
  planTextureSplit,
  sceneKeyOf,
  textureArrayByteSize,
} from '../dist/internal.js';

const MEGABYTE = 2 ** 20;
const KITCHEN = { id: 'kitchen', source: { type: 'equirect', url: 'https://cdn.example.com/kitchen.jpg' } };
const CUBE_SCENE = {
  id: 'hall',
  source: {
    type: 'cube',
    url: 'https://cdn.example.com/hall/{face}.jpg',
    faceNames: { front: 'f', back: 'b' },
  },
};

const KITCHEN_KEY = 'kitchen';
const KITCHEN_SESSION = 'kitchen-session';
const HALL_KEY = 'hall';
const HALL_SESSION = 'hall-session';
const HALL_JOB = 'hall-job';
const BEDROOM_KEY = 'bedroom';
const BEDROOM_SESSION = 'bedroom-session';
const BEDROOM_JOB = 'bedroom-job';
const BATH_KEY = 'bath';
const BATH_SESSION = 'bath-session';
const BATH_JOB = 'bath-job';

const createTrackedCache = (budgetMegabytes) => {
  const disposed = [];
  const cache = createSceneCache(budgetMegabytes, (value) => {
    disposed.push(value);
  });

  return { cache, disposed };
};

describe('scene-navigation · Замена тура: ключ по содержимому сцены', () => {
  it('одинаковые источники в разных турах дают один ключ, id не важен', () => {
    assert.equal(sceneKeyOf(KITCHEN), sceneKeyOf({ ...KITCHEN, id: 'kitchen-v2', title: 'Кухня' }));
  });

  it('порядок ключей faceNames не важен', () => {
    const reordered = {
      ...CUBE_SCENE,
      source: { ...CUBE_SCENE.source, faceNames: { back: 'b', front: 'f' } },
    };

    assert.equal(sceneKeyOf(CUBE_SCENE), sceneKeyOf(reordered));
  });

  it('другой URL, faceNames или превью дают другой ключ', () => {
    const otherUrl = {
      ...KITCHEN,
      source: { ...KITCHEN.source, url: 'https://cdn.example.com/kitchen-2.jpg' },
    };
    const otherFaces = {
      ...CUBE_SCENE,
      source: { ...CUBE_SCENE.source, faceNames: { front: 'front', back: 'b' } },
    };
    const withPreview = {
      ...KITCHEN,
      preview: { type: 'equirect', url: 'https://cdn.example.com/kitchen-s.jpg' },
    };

    assert.notEqual(sceneKeyOf(KITCHEN), sceneKeyOf(otherUrl));
    assert.notEqual(sceneKeyOf(CUBE_SCENE), sceneKeyOf(otherFaces));
    assert.notEqual(sceneKeyOf(KITCHEN), sceneKeyOf(withPreview));
  });
});

describe('scene-navigation · Кэш сцен в видеопамяти', () => {
  it('Возврат в прошлую комнату: обе сцены влезают в бюджет и остаются в кэше', () => {
    const { cache, disposed } = createTrackedCache(256);

    cache.protect([KITCHEN_KEY]);
    cache.add(KITCHEN_KEY, KITCHEN_SESSION, 100 * MEGABYTE);
    cache.protect([BEDROOM_KEY]);
    cache.add(BEDROOM_KEY, BEDROOM_SESSION, 100 * MEGABYTE);

    assert.equal(cache.get(KITCHEN_KEY), KITCHEN_SESSION);
    assert.deepEqual(disposed, []);
  });

  it('Бюджет исчерпан: вытесняется давно не использованная сцена, но не сцена на экране', () => {
    const { cache, disposed } = createTrackedCache(256);

    cache.add(HALL_KEY, HALL_SESSION, 100 * MEGABYTE);
    cache.add(BATH_KEY, BATH_SESSION, 100 * MEGABYTE);
    cache.protect([KITCHEN_KEY]);
    cache.add(KITCHEN_KEY, KITCHEN_SESSION, 50 * MEGABYTE);
    cache.get(HALL_KEY);

    assert.equal(cache.add(BEDROOM_KEY, BEDROOM_SESSION, 100 * MEGABYTE), true);
    assert.deepEqual(disposed, [BATH_SESSION]);
    assert.equal(cache.get(KITCHEN_KEY), KITCHEN_SESSION);
    assert.equal(cache.get(BATH_KEY), undefined);
  });

  it('запись, которая не влезает даже после вытеснения, не удерживается и не вытесняет других', () => {
    const { cache, disposed } = createTrackedCache(256);

    cache.protect([KITCHEN_KEY]);
    cache.add(KITCHEN_KEY, KITCHEN_SESSION, 200 * MEGABYTE);
    cache.add(HALL_KEY, HALL_SESSION, 40 * MEGABYTE);

    assert.equal(cache.add(BEDROOM_KEY, BEDROOM_SESSION, 100 * MEGABYTE), false);
    assert.deepEqual(disposed, [BEDROOM_SESSION]);
    assert.equal(cache.get(HALL_KEY), HALL_SESSION);
  });

  it('защищённая запись удерживается и сверх бюджета', () => {
    const { cache } = createTrackedCache(0);

    cache.protect([KITCHEN_KEY]);

    assert.equal(cache.add(KITCHEN_KEY, KITCHEN_SESSION, 170 * MEGABYTE), true);
    assert.equal(cache.totalBytes(), 170 * MEGABYTE);
  });

  it('Освободить видеопамять: бюджет 0 вытесняет всё, кроме сцены на экране и переходной', () => {
    const { cache, disposed } = createTrackedCache(256);

    cache.protect([KITCHEN_KEY, BEDROOM_KEY]);
    cache.add(KITCHEN_KEY, KITCHEN_SESSION, 50 * MEGABYTE);
    cache.add(BEDROOM_KEY, BEDROOM_SESSION, 50 * MEGABYTE);
    cache.add(HALL_KEY, HALL_SESSION, 50 * MEGABYTE);
    cache.setBudget(0);

    assert.deepEqual(disposed, [HALL_SESSION]);
    assert.equal(cache.totalBytes(), 100 * MEGABYTE);
  });

  it('снятие защиты со старой сцены вытесняет её, если бюджет превышен', () => {
    const { cache, disposed } = createTrackedCache(100);

    cache.protect([KITCHEN_KEY]);
    cache.add(KITCHEN_KEY, KITCHEN_SESSION, 80 * MEGABYTE);
    cache.protect([KITCHEN_KEY, BEDROOM_KEY]);
    cache.add(BEDROOM_KEY, BEDROOM_SESSION, 80 * MEGABYTE);
    cache.protect([BEDROOM_KEY]);

    assert.deepEqual(disposed, [KITCHEN_SESSION]);
  });

  it('другое значение под тем же ключом заменяет и освобождает прежнее, clear освобождает всё', () => {
    const { cache, disposed } = createTrackedCache(256);

    cache.add(KITCHEN_KEY, 'old-session', MEGABYTE);
    cache.add(KITCHEN_KEY, 'new-session', MEGABYTE);
    cache.add(HALL_KEY, HALL_SESSION, MEGABYTE);
    cache.clear();

    assert.deepEqual(disposed, ['old-session', 'new-session', HALL_SESSION]);
    assert.equal(cache.totalBytes(), 0);
  });
});

describe('scene-navigation · Предзагрузка в фоне', () => {
  it('Текущая сцена важнее: при паузе ничего не стартует, затем задачи идут по одной', () => {
    const started = [];
    const queue = createPreloadQueue((job) => {
      started.push(job);
    });

    queue.setPaused(true);
    queue.enqueue(HALL_KEY, HALL_JOB);
    queue.enqueue(BATH_KEY, BATH_JOB);
    queue.enqueue(BEDROOM_KEY, BEDROOM_JOB);

    assert.deepEqual(started, []);

    queue.setPaused(false);
    assert.deepEqual(started, [HALL_JOB]);

    queue.finish(HALL_KEY);
    assert.deepEqual(started, [HALL_JOB, BATH_JOB]);
  });

  it('take забирает задачу из ожидания или активную и запускает следующую', () => {
    const started = [];
    const queue = createPreloadQueue((job) => {
      started.push(job);
    });

    queue.enqueue(HALL_KEY, HALL_JOB);
    queue.enqueue(BATH_KEY, BATH_JOB);
    queue.enqueue(BEDROOM_KEY, BEDROOM_JOB);

    assert.equal(queue.take(BATH_KEY), BATH_JOB);
    assert.equal(queue.find(BATH_KEY), undefined);
    assert.equal(queue.take(HALL_KEY), HALL_JOB);
    assert.deepEqual(started, [HALL_JOB, BEDROOM_JOB]);
  });

  it('removeWhere снимает ожидающие и активную задачи, например при замене тура', () => {
    const started = [];
    const queue = createPreloadQueue((job) => {
      started.push(job);
    });

    queue.enqueue(HALL_KEY, HALL_JOB);
    queue.enqueue(BATH_KEY, BATH_JOB);
    queue.enqueue(BEDROOM_KEY, BEDROOM_JOB);

    assert.deepEqual(
      queue.removeWhere((key) => key !== BEDROOM_KEY),
      [HALL_JOB, BATH_JOB],
    );
    assert.deepEqual(started, [HALL_JOB, BEDROOM_JOB]);
    assert.equal(queue.find(BEDROOM_KEY), BEDROOM_JOB);
  });
});

describe('scene-navigation · Оценка видеопамяти сцены', () => {
  it('эквиректангулярная 8K: около 171 МБ с MIP, одним тайлом или двумя по 4096', () => {
    const whole = textureArrayByteSize({ layerWidth: 8192, layerHeight: 4096, layerCount: 1 });
    const plan = planTextureSplit(8192, 4096, 4096);
    const split = textureArrayByteSize({
      layerWidth: plan.tileWidth,
      layerHeight: plan.tileHeight,
      layerCount: plan.tiles.length,
    });

    assert.ok(Math.abs(whole / MEGABYTE - 170.67) < 0.01, `got ${String(whole / MEGABYTE)} MB`);
    assert.ok(Math.abs(split - whole) / whole < 0.001);
  });

  it('грани куба по 2048: около 128 МБ с MIP', () => {
    const bytes = textureArrayByteSize({ layerWidth: 2048, layerHeight: 2048, layerCount: 6 });

    assert.ok(Math.abs(bytes / MEGABYTE - 128) < 0.01, `got ${String(bytes / MEGABYTE)} MB`);
  });
});
