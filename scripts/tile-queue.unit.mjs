import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TILE_REQUEST_CONCURRENCY, createTileQueue } from '../dist/internal.js';
import { httpError } from './test-helpers.mjs';

const SCREEN = { name: 'screen' };
const PRELOAD = { name: 'preload' };

const settle = () => new Promise((resolve) => setImmediate(resolve));

/**
 * Поддельный загрузчик: запросы висят, пока тест не ответит на них `resolve` или `reject`.
 */
const createFakeNetwork = () => {
  const requests = [];

  const load = (url, signal) =>
    new Promise((resolve, reject) => {
      const request = { url, signal, resolve, reject };

      requests.push(request);
      signal.addEventListener('abort', () => {
        const error = new Error('aborted');

        error.name = 'AbortError';
        reject(error);
      });
    });

  return {
    load,
    requests,
    urls: () => requests.map((request) => request.url),
    pending: () => requests.filter((request) => !request.signal.aborted && !request.isDone),
    answer: async (url, image = { url }) => {
      const request = requests.findLast((item) => item.url === url);

      request.isDone = true;
      request.resolve(image);
      await settle();
    },
    fail: async (url, error) => {
      const request = requests.findLast((item) => item.url === url);

      request.isDone = true;
      request.reject(error);
      await settle();
    },
  };
};

const createQueue = () => {
  const network = createFakeNetwork();
  const loaded = [];
  const failures = [];
  const discarded = [];
  const queue = createTileQueue({
    concurrency: TILE_REQUEST_CONCURRENCY,
    load: network.load,
    discard: (image) => discarded.push(image),
    onLoaded: (url) => loaded.push(url),
    onFailed: (url, error) => failures.push({ url, error }),
  });

  return { queue, network, loaded, failures, discarded };
};

const wantsOf = (prefix, count, { level = 1, isPreload = false } = {}) =>
  Array.from({ length: count }, (_unused, index) => ({
    url: `${prefix}-${String(index)}`,
    level,
    distance: index,
    isPreload,
  }));

describe('multiresolution · Видимые тайлы и порядок загрузки (очередь)', () => {
  it('не больше 8 запросов одновременно', () => {
    const { queue, network } = createQueue();

    queue.want(SCREEN, wantsOf('tile', 20));

    assert.equal(network.requests.length, 8);
  });

  it('Новая сторона после готовности: сначала второй уровень от центра, затем третий', async () => {
    const { queue, network } = createQueue();
    const third = wantsOf('third', 4, { level: 3 });
    const second = wantsOf('second', 6, { level: 2 }).toReversed();

    queue.want(SCREEN, [...third, ...second]);

    assert.deepEqual(network.urls(), [
      'second-0',
      'second-1',
      'second-2',
      'second-3',
      'second-4',
      'second-5',
      'third-0',
      'third-1',
    ]);

    await network.answer('second-0');

    assert.equal(network.urls().at(-1), 'third-2');
  });

  it('Разворот на медленной сети: запросы старого направления отменены, места отданы новому', async () => {
    const { queue, network, loaded, failures } = createQueue();

    queue.want(SCREEN, wantsOf('front', 10));
    queue.want(SCREEN, wantsOf('back', 3));
    await settle();

    assert.ok(network.requests.slice(0, 8).every((request) => request.signal.aborted));
    assert.deepEqual(
      network.pending().map((request) => request.url),
      ['back-0', 'back-1', 'back-2'],
    );
    assert.deepEqual(loaded, []);
    assert.deepEqual(failures, []);
  });

  it('ответ загрузчика, не заметившего отмену, освобождается и не доставляется', async () => {
    const answers = [];
    const loaded = [];
    const discarded = [];
    const queue = createTileQueue({
      concurrency: TILE_REQUEST_CONCURRENCY,
      load: () => new Promise((resolve) => answers.push(resolve)),
      discard: (image) => discarded.push(image),
      onLoaded: (url) => loaded.push(url),
      onFailed: () => undefined,
    });

    queue.want(SCREEN, wantsOf('front', 1));
    queue.want(SCREEN, []);
    answers[0]({ url: 'front-0' });
    await settle();

    assert.deepEqual(loaded, []);
    assert.deepEqual(discarded, [{ url: 'front-0' }]);
  });

  it('Сбой тайла при повороте: ошибка сообщается, тайл не запрашивается, пока он в кадре', async () => {
    const { queue, network, failures } = createQueue();

    queue.want(SCREEN, wantsOf('side', 1));
    await network.fail('side-0', httpError(500, 'side-0'));
    queue.want(SCREEN, wantsOf('side', 1));

    assert.equal(failures.length, 1);
    assert.equal(queue.isFailed('side-0'), true);
    assert.equal(network.requests.length, 1);
  });

  it('Повтор после возврата: тайл ушёл из кадра и вернулся — запрос снова', async () => {
    const { queue, network } = createQueue();

    queue.want(SCREEN, wantsOf('side', 1));
    await network.fail('side-0', httpError(500, 'side-0'));
    queue.want(SCREEN, []);
    queue.want(SCREEN, wantsOf('side', 1));

    assert.equal(queue.isFailed('side-0'), false);
    assert.deepEqual(network.urls(), ['side-0', 'side-0']);
  });

  it('forgetFailures (retry) запрашивает сбойный тайл снова, хотя он в кадре', async () => {
    const { queue, network } = createQueue();

    queue.want(SCREEN, wantsOf('ready', 1));
    await network.fail('ready-0', httpError(404, 'ready-0'));
    queue.forgetFailures(['ready-0']);

    assert.deepEqual(network.urls(), ['ready-0', 'ready-0']);
  });

  it('Поворот во время предзагрузки: тайлы сцены на экране раньше оставшихся тайлов предзагрузки', async () => {
    const { queue, network } = createQueue();

    queue.want(PRELOAD, wantsOf('next-room', 12, { isPreload: true }));
    queue.want(SCREEN, wantsOf('side', 3, { level: 3 }));
    await network.answer('next-room-0');
    await network.answer('next-room-1');
    await network.answer('next-room-2');
    await network.answer('next-room-3');

    assert.deepEqual(network.urls().slice(8), ['side-0', 'side-1', 'side-2', 'next-room-8']);
  });

  it('тайл, нужный двум владельцам, запрашивается один раз и доставляется один раз', async () => {
    const { queue, network, loaded } = createQueue();

    queue.want(SCREEN, wantsOf('shared', 1));
    queue.want(PRELOAD, wantsOf('shared', 1, { isPreload: true }));
    await network.answer('shared-0');
    queue.want(SCREEN, wantsOf('shared', 1));

    assert.deepEqual(network.urls(), ['shared-0', 'shared-0']);
    assert.deepEqual(loaded, ['shared-0']);
  });

  it('dispose отменяет все запросы и больше ничего не запрашивает', () => {
    const { queue, network } = createQueue();

    queue.want(SCREEN, wantsOf('tile', 3));
    queue.dispose();
    queue.want(SCREEN, wantsOf('other', 3));

    assert.ok(network.requests.every((request) => request.signal.aborted));
    assert.equal(network.requests.length, 3);
  });
});
