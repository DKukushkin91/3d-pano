import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  DEFAULT_RETRY_OPTIONS,
  EnumErrorCategory,
  EnumErrorCode,
  EnumSourceType,
  decodeImage,
  fetchImageBlob,
  loadImage,
  loadProgress,
  planTextureSplit,
  retryDelayMs,
  sceneImageCount,
  withRetry,
} from '../dist/internal.js';
import { FACE_URL, IMAGE_URL, httpError, networkError, rejectionOf } from './test-helpers.mjs';

const originalFetch = globalThis.fetch;

const recordWaits = () => {
  const waits = [];

  return { waits, wait: async (durationMs) => void waits.push(durationMs) };
};

const failingTimes = (failures, error, result = 'image') => {
  let calls = 0;

  return {
    calls: () => calls,
    operation: async () => {
      calls += 1;

      if (calls <= failures) {
        throw error;
      }

      return result;
    },
  };
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('panorama-sources · Повтор загрузки', () => {
  const signal = new AbortController().signal;

  it('по умолчанию два повтора: задержки 500 и 1500 мс', () => {
    assert.deepEqual(DEFAULT_RETRY_OPTIONS, { attempts: 2, delayMs: 500 });
    assert.equal(retryDelayMs(0, DEFAULT_RETRY_OPTIONS), 500);
    assert.equal(retryDelayMs(1, DEFAULT_RETRY_OPTIONS), 1500);
  });

  it('Кратковременный сбой сети: вторая попытка успешна, ошибки нет', async () => {
    const { waits, wait } = recordWaits();
    const flaky = failingTimes(1, networkError());

    assert.equal(await withRetry(flaky.operation, { retry: DEFAULT_RETRY_OPTIONS, signal, wait }), 'image');
    assert.equal(flaky.calls(), 2);
    assert.deepEqual(waits, [500]);
  });

  it('Файла нет: ответ 404 не повторяется', async () => {
    const { waits, wait } = recordWaits();
    const missing = failingTimes(5, httpError(404));
    const error = await rejectionOf(
      withRetry(missing.operation, { retry: DEFAULT_RETRY_OPTIONS, signal, wait }),
    );

    assert.equal(error.details.code, EnumErrorCode.HttpStatus);
    assert.equal(missing.calls(), 1);
    assert.deepEqual(waits, []);
  });

  it('ответ 503 повторяется, после исчерпания попыток пробрасывается последняя ошибка', async () => {
    const { waits, wait } = recordWaits();
    const broken = failingTimes(5, httpError(503));
    const error = await rejectionOf(
      withRetry(broken.operation, { retry: DEFAULT_RETRY_OPTIONS, signal, wait }),
    );

    assert.equal(error.details.httpStatus, 503);
    assert.equal(broken.calls(), 3);
    assert.deepEqual(waits, [500, 1500]);
  });

  it('attempts: 0 отключает повторы', async () => {
    const flaky = failingTimes(1, networkError());

    await rejectionOf(withRetry(flaky.operation, { retry: { attempts: 0, delayMs: 500 }, signal }));
    assert.equal(flaky.calls(), 1);
  });

  it('отменённая загрузка не повторяется', async () => {
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const aborted = failingTimes(5, abortError);
    const error = await rejectionOf(withRetry(aborted.operation, { retry: DEFAULT_RETRY_OPTIONS, signal }));

    assert.equal(error.name, 'AbortError');
    assert.equal(aborted.calls(), 1);
  });
});

describe('viewer-state-events · Описание ошибок', () => {
  const signal = new AbortController().signal;

  it('Ответ 404: категория resource, код http-status, httpStatus 404 и URL', async () => {
    globalThis.fetch = async () => new Response(null, { status: 404 });

    const error = await rejectionOf(fetchImageBlob(IMAGE_URL, signal));

    assert.deepEqual(
      { ...error.details },
      {
        category: EnumErrorCategory.Resource,
        code: EnumErrorCode.HttpStatus,
        message: `Server responded with 404 for ${IMAGE_URL}`,
        url: IMAGE_URL,
        httpStatus: 404,
      },
    );
  });

  it('сбой сети даёт код network-failed с исходной ошибкой в cause', async () => {
    const failure = new TypeError('fetch failed');

    globalThis.fetch = async () => {
      throw failure;
    };

    const error = await rejectionOf(fetchImageBlob(IMAGE_URL, signal));

    assert.equal(error.details.code, EnumErrorCode.NetworkFailed);
    assert.equal(error.details.cause, failure);
  });

  it('Сбой загрузчика хоста: код loader-failed, исходная ошибка в cause', async () => {
    const failure = new Error('token expired');
    const error = await rejectionOf(
      loadImage(IMAGE_URL, {
        loader: async () => {
          throw failure;
        },
        retry: { attempts: 0, delayMs: 0 },
        signal,
      }),
    );

    assert.equal(error.details.category, EnumErrorCategory.Resource);
    assert.equal(error.details.code, EnumErrorCode.LoaderFailed);
    assert.equal(error.details.cause, failure);
  });

  it('загрузчик хоста, вернувший не Blob и не ImageBitmap, — тоже loader-failed', async () => {
    const error = await rejectionOf(
      loadImage(IMAGE_URL, {
        loader: async () => 'not an image',
        retry: { attempts: 0, delayMs: 0 },
        signal,
      }),
    );

    assert.equal(error.details.code, EnumErrorCode.LoaderFailed);
  });

  it('Битый файл: HTML вместо изображения даёт decode-failed', async () => {
    const error = await rejectionOf(
      decodeImage(new Blob(['<html></html>'], { type: 'text/html' }), IMAGE_URL),
    );

    assert.equal(error.details.code, EnumErrorCode.DecodeFailed);
    assert.equal(error.details.url, IMAGE_URL);
  });
});

describe('panorama-sources · Изображения больше лимита видеокарты', () => {
  it('8K на устройстве с лимитом 4096: два тайла 4096×4096', () => {
    const plan = planTextureSplit(8192, 4096, 4096);

    assert.equal(plan.columns, 2);
    assert.equal(plan.rows, 1);
    assert.deepEqual(
      plan.tiles.map(({ x, y, width, height }) => [x, y, width, height]),
      [
        [0, 0, 4096, 4096],
        [4096, 0, 4096, 4096],
      ],
    );
  });

  it('изображение, которое влезает, остаётся одним тайлом', () => {
    assert.equal(planTextureSplit(8192, 4096, 16384).tiles.length, 1);
  });

  it('неровный размер: слои одного размера, крайние тайлы уже', () => {
    const plan = planTextureSplit(10000, 5000, 4096);

    assert.deepEqual([plan.columns, plan.rows, plan.tileWidth, plan.tileHeight], [3, 2, 3334, 2500]);
    assert.equal(plan.tiles.at(-1).width, 10000 - 2 * 3334);
    assert.ok(plan.tiles.every((tile) => tile.width <= 4096 && tile.height <= 4096));
  });
});

describe('panorama-sources · Прогресс загрузки сцены', () => {
  it('Куб с превью: превью и три грани из семи — 4/7', () => {
    const scene = {
      id: 'kitchen',
      source: { type: EnumSourceType.Cube, url: FACE_URL },
      preview: { type: EnumSourceType.Equirect, url: IMAGE_URL },
    };

    assert.equal(sceneImageCount(scene), 7);
    assert.equal(loadProgress(4, 7), 4 / 7);
  });
});
