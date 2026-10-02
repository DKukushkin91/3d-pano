import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  areViewerOptionsEqual,
  minimumFovForPixelZoom,
  pixelsPerRadianForCube,
  resolveViewerOptions,
  tiledCubeDensity,
} from '../dist/internal.js';

const LABEL = 'Apartment tour';

const zoomContext = (sourcePixelsPerRadian) => ({
  limits: { fov: [1, 120], maxPixelZoom: 2, bounds: 'auto' },
  viewportWidth: 1000,
  viewportHeight: 1000,
  sourcePixelsPerRadian,
  previousFov: null,
});

const createOptions = (fields = {}) => resolveViewerOptions(null, { label: LABEL, ...fields });

describe('multiresolution · Опция бюджета тайлов', () => {
  it('по умолчанию 128 МБ, 0 допустим — только подложки', () => {
    assert.equal(createOptions().tileCacheMegabytes, 128);
    assert.equal(createOptions({ tileCacheMegabytes: 0 }).tileCacheMegabytes, 0);
  });

  it('Отрицательный бюджет тайлов: RangeError с 3d-pano: и именем опции', () => {
    assert.throws(() => createOptions({ tileCacheMegabytes: -1 }), {
      name: 'RangeError',
      message: /^3d-pano: .*tileCacheMegabytes/,
    });
    assert.throws(() => createOptions({ tileCacheMegabytes: Number.NaN }), RangeError);
    assert.throws(() => createOptions({ tileCacheMegabytes: Number.POSITIVE_INFINITY }), RangeError);
  });

  it('update: undefined возвращает 128, другие ключи бюджет не трогают, новое значение — изменение', () => {
    const current = createOptions({ tileCacheMegabytes: 32 });

    assert.equal(resolveViewerOptions(current, { tileCacheMegabytes: undefined }).tileCacheMegabytes, 128);
    assert.equal(resolveViewerOptions(current, { label: 'Kitchen' }).tileCacheMegabytes, 32);
    assert.equal(
      areViewerOptionsEqual(current, resolveViewerOptions(current, { tileCacheMegabytes: 0 })),
      false,
    );
  });
});

describe('multiresolution · Проявление тайлов (опция)', () => {
  it('по умолчанию 200 мс, 0 — сразу', () => {
    assert.equal(createOptions().tileFadeMs, 200);
    assert.equal(createOptions({ tileFadeMs: 0 }).tileFadeMs, 0);
  });

  it('нечисловое, бесконечное или отрицательное значение — RangeError с именем опции', () => {
    for (const tileFadeMs of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(() => createOptions({ tileFadeMs }), {
        name: 'RangeError',
        message: /^3d-pano: .*tileFadeMs/,
      });
    }
  });

  it('update: undefined возвращает 200, новое значение — изменение', () => {
    const current = createOptions({ tileFadeMs: 0 });

    assert.equal(resolveViewerOptions(current, { tileFadeMs: undefined }).tileFadeMs, 200);
    assert.equal(areViewerOptionsEqual(current, resolveViewerOptions(current, { tileFadeMs: 100 })), false);
  });
});

describe('camera-view · Ограничение увеличения по разрешению источника (тайловый куб)', () => {
  it('Приближение тайлового куба: предел по уровню 4096, а не по подложке 512', () => {
    const source = {
      type: 'cube',
      url: '/{level}/{face}/{row}_{col}.jpg',
      tileSize: 512,
      levels: [512, 1024, 2048, 4096],
    };
    const view = { yaw: 0, pitch: 0, roll: 0, fov: 90, fovMode: 'max' };
    const tiledFloor = minimumFovForPixelZoom(view, zoomContext(tiledCubeDensity(source)));
    const baseFloor = minimumFovForPixelZoom(view, zoomContext(pixelsPerRadianForCube(512)));

    assert.equal(tiledCubeDensity(source), pixelsPerRadianForCube(4096));
    assert.ok(tiledFloor < baseFloor / 4);
  });
});
