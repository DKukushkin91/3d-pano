import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPyramidIndex, createTileReadiness, createTileResidency } from '../dist/internal.js';
import { httpError, rejectionOf } from './test-helpers.mjs';

const SOURCE = {
  type: 'cube',
  url: '/tiles/kitchen/{level}/{face}/{row}_{col}.jpg',
  faceNames: { front: 'f', right: 'r', back: 'b', left: 'l', up: 'u', down: 'd' },
  tileSize: 512,
  levels: [512, 1024, 2048],
};
const PREVIEW_KEY = 'preview:0';
const settle = () => new Promise((resolve) => setImmediate(resolve));

const frameKeys = (count) => Array.from({ length: count }, (_unused, index) => `frame-${String(index)}`);

const createFakeTable = () => {
  const writes = new Map();

  return { writes, set: (index, slot, opacity) => writes.set(index, { slot, opacity }) };
};

describe('panorama-sources · Прогресс загрузки сцены (тайловый куб)', () => {
  it('Тайловый куб: превью, подложка из шести тайлов и три тайла кадра из десяти — 10/17', () => {
    const readiness = createTileReadiness();
    const base = createPyramidIndex(SOURCE).baseUrls;
    const frame = frameKeys(10);

    void readiness.add([PREVIEW_KEY, ...base, ...frame], () => false, false);

    for (const key of [PREVIEW_KEY, ...base, ...frame.slice(0, 3)]) {
      readiness.markAvailable(key);
    }

    assert.equal(readiness.progress(), 10 / 17);
  });
});

describe('multiresolution · Готовность тайловой сцены (ожидания)', () => {
  it('ожидание разрешается, когда доступны все его изображения, уже доступные не ждутся', async () => {
    const readiness = createTileReadiness();
    let isReady = false;

    void readiness
      .add(['base', 'frame'], (key) => key === 'base', false)
      .then(() => {
        isReady = true;
      });
    await settle();
    assert.equal(isReady, false);
    assert.deepEqual([...readiness.pendingKeys()], ['frame']);

    readiness.markAvailable('frame');
    await settle();
    assert.equal(isReady, true);
    assert.equal(readiness.hasWaiters(), false);
  });

  it('ошибка изображения отклоняет только ожидания, где оно есть', async () => {
    const readiness = createTileReadiness();
    const error = httpError(404, 'frame-a');
    const withTile = readiness.add(['frame-a', 'frame-b'], () => false, false);
    const without = readiness.add(['frame-b'], () => false, true);

    readiness.fail('frame-a', error);
    readiness.markAvailable('frame-b');

    assert.equal(await rejectionOf(withTile), error);
    assert.equal(await without, undefined);
  });

  it('предзагрузка без смены — только предзагрузка; смена поднимает приоритет', () => {
    const readiness = createTileReadiness();

    void readiness.add(['a'], () => false, true);
    assert.equal(readiness.isPreloadOnly(), true);

    void readiness.add(['b'], () => false, false);
    assert.equal(readiness.isPreloadOnly(), false);
  });

  it('прогресс — по последнему ожиданию; без ожиданий — null', () => {
    const readiness = createTileReadiness();

    assert.equal(readiness.progress(), null);
    void readiness.add(['a', 'b'], () => false, true);
    void readiness.add(['c', 'd', 'e', 'f'], (key) => key === 'c', false);

    assert.equal(readiness.progress(), 1 / 4);
  });
});

describe('multiresolution · Проявление тайлов (учёт в таблице)', () => {
  it('Плавная чёткость: поздний тайл набирает непрозрачность за fadeMs с первого кадра', () => {
    const table = createFakeTable();
    const residency = createTileResidency(table);

    residency.place('tile', 7, 3, true);
    assert.deepEqual(table.writes.get(7), { slot: 3, opacity: 0 });

    assert.equal(residency.step(1000, 200), true);
    assert.equal(residency.step(1100, 200), true);
    assert.deepEqual(table.writes.get(7), { slot: 3, opacity: 0.5 });
    assert.equal(residency.step(1250, 200), false);
    assert.deepEqual(table.writes.get(7), { slot: 3, opacity: 1 });
  });

  it('Без проявления: tileFadeMs 0 — тайл виден в первом же кадре', () => {
    const table = createFakeTable();
    const residency = createTileResidency(table);

    residency.place('tile', 2, 0, true);

    assert.equal(residency.step(500, 0), false);
    assert.deepEqual(table.writes.get(2), { slot: 0, opacity: 1 });
  });

  it('тайл до готовности виден сразу, вытесненный и сброшенный убирается из таблицы', () => {
    const table = createFakeTable();
    const residency = createTileResidency(table);

    residency.place('ready', 1, 4, false);
    residency.place('other', 2, 5, false);
    assert.deepEqual(table.writes.get(1), { slot: 4, opacity: 1 });

    residency.remove('ready');
    assert.deepEqual(table.writes.get(1), { slot: null, opacity: 0 });
    assert.equal(residency.isResident('ready'), false);

    residency.clear();
    assert.equal(residency.isResident('other'), false);
  });
});

describe('multiresolution · Индекс пирамиды', () => {
  it('URL тайла даёт его размер и запись в таблице, подложка в таблице не рисуется', () => {
    const pyramid = createPyramidIndex(SOURCE);
    const url = pyramid.remember({ level: 2, face: 1, row: 3, column: 2 });

    assert.equal(url, '/tiles/kitchen/2/r/3_2.jpg');
    assert.equal(pyramid.tileSizeOf(url), 512);
    assert.equal(pyramid.tableIndexOf(url), 6 + 24 + 16 + 12 + 2);
    assert.equal(pyramid.tableIndexOf(pyramid.baseUrls[0]), null);
    assert.equal(pyramid.entryCount, 6 + 24 + 96);
    assert.equal(pyramid.tileSizeOf('/unknown.jpg'), null);
  });

  it('подложка — шесть тайлов первого уровня, приоритет запомнен для запроса', () => {
    const pyramid = createPyramidIndex(SOURCE);
    const url = pyramid.rememberWanted({ level: 1, face: 0, row: 0, column: 1, distance: 0.2 }, true);

    assert.equal(pyramid.baseUrls.length, 6);
    assert.equal(pyramid.isBaseUrl('/tiles/kitchen/0/u/0_0.jpg'), true);
    assert.deepEqual(pyramid.priorityOf(url), { url, level: 1, distance: 0.2, isPreload: true });
  });
});
