import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createSurfaceStore, surfacesOfFrame } from '../dist/internal.js';

const SPOT_URL = '/surfaces/floor-spot.png';
const MAX_TEXTURE_SIZE = 4096;

const settle = () => new Promise((resolve) => setImmediate(resolve));

/**
 * Поддельные эффекты: текстура — объект с номером заливки и картинкой, освобождённые копятся в списке.
 */
const createEffects = () => {
  const effects = {
    uploads: 0,
    released: [],
    changes: 0,
    maxTextureSize: MAX_TEXTURE_SIZE,
    upload: (image, previous) => {
      effects.uploads += 1;

      return previous ?? { image, id: effects.uploads };
    },
    release: (texture) => {
      effects.released.push(texture);
    },
    sizeOf: (image) => image.size,
    onChange: () => {
      effects.changes += 1;
    },
  };

  return effects;
};

/**
 * Поддельный загрузчик URL: считает вызовы, отвечает по команде и помнит сигналы.
 */
const createLoader = () => {
  const loader = {
    calls: 0,
    signals: [],
    pending: [],
    load: (url) => (signal) => {
      loader.calls += 1;
      loader.signals.push(signal);

      return new Promise((resolve, reject) => {
        loader.pending.push({ url, resolve, reject });
      });
    },
  };

  return loader;
};

const picture = (width = 128, height = 128) => ({ size: { width, height } });

describe('hotspot-surfaces · Загрузка картинки поверхности (учёт)', () => {
  it('Двадцать одинаковых меток: загрузчик вызван один раз, все рисуют одну текстуру', async () => {
    const effects = createEffects();
    const loader = createLoader();
    const store = createSurfaceStore(effects);
    const handles = Array.from({ length: 20 }, () => store.acquire(SPOT_URL, loader.load(SPOT_URL)));

    await settle();
    assert.equal(loader.calls, 1);
    assert.equal(handles[0].current(), null);

    loader.pending[0].resolve(picture());
    await settle();

    const textures = new Set(handles.map((handle) => handle.current().texture));

    assert.equal(textures.size, 1);
    assert.equal(effects.uploads, 1);
    assert.deepEqual(handles[7].current().size, { width: 128, height: 128 });
    assert.equal(effects.changes, 1);
  });

  it('Битая картинка: поверхности нет, событий нет, следующий acquire пробует снова', async () => {
    const effects = createEffects();
    const loader = createLoader();
    const store = createSurfaceStore(effects);
    const first = store.acquire(SPOT_URL, loader.load(SPOT_URL));

    await settle();
    loader.pending[0].reject(new Error('404'));
    await settle();

    assert.equal(first.current(), null);
    assert.equal(effects.uploads, 0);
    assert.equal(loader.signals[0].aborted, true);

    const second = store.acquire(SPOT_URL, loader.load(SPOT_URL));

    await settle();
    assert.equal(loader.calls, 2);
    loader.pending[1].resolve(picture());
    await settle();
    assert.notEqual(first.current(), null);
    assert.equal(first.current().texture, second.current().texture);
  });

  it('источник больше лимита текстуры не рисуется, как сбой', async () => {
    const effects = createEffects();
    const loader = createLoader();
    const store = createSurfaceStore(effects);
    const handle = store.acquire(SPOT_URL, loader.load(SPOT_URL));

    await settle();
    loader.pending[0].resolve(picture(MAX_TEXTURE_SIZE + 1, 16));
    await settle();

    assert.equal(handle.current(), null);
    assert.equal(effects.uploads, 0);
  });

  it('refresh заливает тот же источник в ту же текстуру — так обновляется <canvas> и кадр видео', async () => {
    const effects = createEffects();
    const canvas = picture(64, 32);
    const store = createSurfaceStore(effects);
    const handle = store.acquire(canvas, () => Promise.resolve(canvas));

    await settle();

    const { texture } = handle.current();

    canvas.size = { width: 64, height: 48 };
    handle.refresh();

    assert.equal(effects.uploads, 2);
    assert.equal(handle.current().texture, texture);
    assert.deepEqual(handle.current().size, { width: 64, height: 48 });
  });
});

describe('hotspot-surfaces · Освобождение поверхностей (учёт)', () => {
  it('Общая текстура: живёт, пока её рисует второй хотспот, освобождается после его удаления', async () => {
    const effects = createEffects();
    const loader = createLoader();
    const store = createSurfaceStore(effects);
    const first = store.acquire(SPOT_URL, loader.load(SPOT_URL));
    const second = store.acquire(SPOT_URL, loader.load(SPOT_URL));

    await settle();
    loader.pending[0].resolve(picture());
    await settle();

    const { texture } = second.current();

    first.release();
    first.release();
    assert.deepEqual(effects.released, []);
    assert.equal(second.current().texture, texture);
    assert.equal(first.current(), null);

    second.release();
    assert.deepEqual(effects.released, [texture]);
    assert.equal(store.count(), 0);
    assert.equal(loader.signals[0].aborted, true);
  });

  it('освобождение во время загрузки отменяет её, а поздний ответ ничего не заливает', async () => {
    const effects = createEffects();
    const loader = createLoader();
    const store = createSurfaceStore(effects);
    const handle = store.acquire(SPOT_URL, loader.load(SPOT_URL));

    await settle();
    handle.release();
    assert.equal(loader.signals[0].aborted, true);

    loader.pending[0].resolve(picture());
    await settle();
    assert.equal(effects.uploads, 0);
    assert.equal(store.count(), 0);
  });

  it('dispose освобождает все текстуры и отменяет загрузки', async () => {
    const effects = createEffects();
    const loader = createLoader();
    const store = createSurfaceStore(effects);

    store.acquire(SPOT_URL, loader.load(SPOT_URL));
    store.acquire('/tv.mp4', loader.load('/tv.mp4'));
    await settle();
    loader.pending[0].resolve(picture());
    await settle();

    store.dispose();
    assert.equal(effects.released.length, 1);
    assert.equal(
      loader.signals.every((signal) => signal.aborted),
      true,
    );
    assert.equal(store.count(), 0);
  });
});

const entry = (name, scene, isLeaving = false, handle = null) => ({ name, scene, isLeaving, handle });
const BALCONY_SPOT = 'balcony-spot';
const namesOf = (entries) => entries.map((item) => item.name);

describe('hotspot-surfaces · Поверхности при смене сцен', () => {
  it('Шаг к метке: диски номера — с уходящим номером, диски балкона — с балконом', () => {
    const entries = [entry('room-spot', 'room', true), entry(BALCONY_SPOT, 'balcony')];
    const during = surfacesOfFrame(entries, { current: 'balcony', previous: 'room' });

    assert.deepEqual(namesOf(during.current), [BALCONY_SPOT]);
    assert.deepEqual(namesOf(during.previous), ['room-spot']);
    assert.deepEqual(namesOf(during.finished), []);

    const after = surfacesOfFrame(entries, { current: 'balcony', previous: null });

    assert.deepEqual(namesOf(after.current), [BALCONY_SPOT]);
    assert.deepEqual(namesOf(after.previous), []);
    assert.deepEqual(namesOf(after.finished), ['room-spot']);
  });

  it('Пин без сцены при смене ремонта — рисуется с обеими сценами', () => {
    const entries = [entry('pin', null), entry('host-v1', 'room-v1'), entry('host-v2', 'room-v2')];
    const during = surfacesOfFrame(entries, { current: 'room-v2', previous: 'room-v1' });

    assert.deepEqual(namesOf(during.current), ['pin', 'host-v2']);
    assert.deepEqual(namesOf(during.previous), ['pin', 'host-v1']);
    assert.deepEqual(namesOf(during.finished), []);
  });

  it('удалённый хотспот хоста и уходящие записи без перехода освобождаются сразу', () => {
    const entries = [
      entry('removed-pin', null, true),
      entry('rebuilt', 'room', true),
      entry('fresh', 'room'),
    ];
    const frame = surfacesOfFrame(entries, { current: 'room', previous: null });

    assert.deepEqual(namesOf(frame.current), ['fresh']);
    assert.deepEqual(namesOf(frame.finished), ['removed-pin', 'rebuilt']);
  });

  it('Замена тура: после перехода текстур старого тура не осталось', async () => {
    const effects = createEffects();
    const store = createSurfaceStore(effects);
    const oldSpot = picture();
    const newSpot = picture();
    const oldEntries = ['a', 'b'].map((name) =>
      entry(
        name,
        'old-flat',
        true,
        store.acquire(oldSpot, () => Promise.resolve(oldSpot)),
      ),
    );
    const newEntries = [
      entry(
        'c',
        'new-flat',
        false,
        store.acquire(newSpot, () => Promise.resolve(newSpot)),
      ),
    ];

    await settle();

    const entries = [...oldEntries, ...newEntries];

    assert.equal(surfacesOfFrame(entries, { current: 'new-flat', previous: 'old-flat' }).finished.length, 0);

    for (const finished of surfacesOfFrame(entries, { current: 'new-flat', previous: null }).finished) {
      finished.handle.release();
    }

    assert.equal(store.count(), 1);
    assert.equal(effects.released.length, 1);
  });
});
