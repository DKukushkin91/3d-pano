import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_CONTROLS_OPTIONS,
  DEFAULT_RETRY_OPTIONS,
  LIBRARY_DEFAULT_VIEW,
  applyViewSettings,
  drawingBufferSize,
  resolveViewerOptions,
} from '../dist/internal.js';

const LABEL = 'Apartment tour';

const createOptions = (fields = {}) => resolveViewerOptions(null, { label: LABEL, ...fields });

describe('viewer-lifecycle · Безопасный импорт без DOM', () => {
  it('Импорт на сервере: обе точки входа ядра загружаются в Node без window и document', async () => {
    assert.equal(globalThis.window, undefined);
    assert.equal(globalThis.document, undefined);

    const core = await import('../dist/index.js');

    assert.equal(typeof core.createPanoViewer, 'function');
    assert.equal(typeof core.validateTour, 'function');
    assert.equal(core.EnumViewerStatus.Ready, 'ready');
  });

  it('createPanoViewer без DOM отклоняет контейнер синхронной ошибкой TypeError', async () => {
    const { createPanoViewer } = await import('../dist/index.js');

    assert.throws(() => createPanoViewer({}, { tour: { scenes: [] }, label: LABEL }), TypeError);
  });
});

describe('viewer-lifecycle · Проверка опций', () => {
  it('умолчания: maxPixelRatio 2, renderScale 1, повтор 2 × 500 мс, всё управление включено', () => {
    assert.deepEqual(createOptions(), {
      label: LABEL,
      loader: null,
      retry: DEFAULT_RETRY_OPTIONS,
      controls: DEFAULT_CONTROLS_OPTIONS,
      maxPixelRatio: 2,
      renderScale: 1,
    });
  });

  it('Отрицательная плотность пикселей: RangeError с префиксом 3d-pano: и именем опции', () => {
    assert.throws(() => createOptions({ maxPixelRatio: -1 }), {
      name: 'RangeError',
      message: /^3d-pano: .*maxPixelRatio/,
    });
  });

  const invalidOptions = [
    { name: 'renderScale', fields: { renderScale: 0 } },
    { name: 'controls.wheelSpeed', fields: { controls: { wheelSpeed: Number.NaN } } },
    { name: 'controls.keyboardSpeed', fields: { controls: { keyboardSpeed: -2 } } },
    { name: 'controls.inertiaFriction', fields: { controls: { inertiaFriction: Number.POSITIVE_INFINITY } } },
    { name: 'retry.attempts', fields: { retry: { attempts: 1.5 } } },
    { name: 'retry.delayMs', fields: { retry: { delayMs: -1 } } },
  ];

  for (const { name, fields } of invalidOptions) {
    it(`неверное значение ${name} даёт RangeError`, () => {
      assert.throws(() => createOptions(fields), {
        name: 'RangeError',
        message: new RegExp(name.replace('.', '\\.')),
      });
    });
  }

  it('пустой label и не-функция в loader дают TypeError', () => {
    assert.throws(() => resolveViewerOptions(null, { label: '  ' }), TypeError);
    assert.throws(() => createOptions({ loader: 'fetch' }), TypeError);
  });
});

describe('viewer-lifecycle · Обновление опций', () => {
  it('Сброс опции к умолчанию: ключ со значением undefined возвращает maxPixelRatio 2', () => {
    const updated = resolveViewerOptions(createOptions({ maxPixelRatio: 1 }), { maxPixelRatio: undefined });

    assert.equal(updated.maxPixelRatio, 2);
  });

  it('незатронутые ключи сохраняют текущие значения', () => {
    const current = createOptions({ maxPixelRatio: 1, renderScale: 0.5 });
    const updated = resolveViewerOptions(current, { label: 'Kitchen' });

    assert.equal(updated.maxPixelRatio, 1);
    assert.equal(updated.renderScale, 0.5);
    assert.equal(updated.label, 'Kitchen');
  });

  it('Отключение колеса на лету: controls заменяется целиком, остальные способы — по умолчанию', () => {
    const current = createOptions({ controls: { drag: false } });
    const updated = resolveViewerOptions(current, { controls: { wheel: false } });

    assert.equal(updated.controls.wheel, false);
    assert.equal(updated.controls.drag, true);
    assert.equal(updated.controls.keyboard, true);
  });
});

describe('viewer-lifecycle · Размер и плотность пикселей', () => {
  it('Экран высокой плотности: при devicePixelRatio 3 буфер вдвое больше CSS-размера', () => {
    assert.deepEqual(
      drawingBufferSize({
        cssWidth: 800,
        cssHeight: 450,
        devicePixelRatio: 3,
        maxPixelRatio: 2,
        renderScale: 1,
      }),
      { width: 1600, height: 900 },
    );
  });

  it('renderScale уменьшает буфер, размер не меньше одного пикселя', () => {
    assert.deepEqual(
      drawingBufferSize({
        cssWidth: 800,
        cssHeight: 450,
        devicePixelRatio: 1,
        maxPixelRatio: 2,
        renderScale: 0.5,
      }),
      { width: 400, height: 225 },
    );
    assert.deepEqual(
      drawingBufferSize({ cssWidth: 0, cssHeight: 0, devicePixelRatio: 2, maxPixelRatio: 2, renderScale: 1 }),
      { width: 1, height: 1 },
    );
  });
});

describe('camera-view · Параметры вида', () => {
  it('setView накладывает только заданные поля', () => {
    assert.deepEqual(applyViewSettings(LIBRARY_DEFAULT_VIEW, { yaw: 35, fov: undefined }), {
      ...LIBRARY_DEFAULT_VIEW,
      yaw: 35,
    });
  });

  it('нечисловой угол и неизвестный fovMode дают RangeError', () => {
    assert.throws(() => applyViewSettings(LIBRARY_DEFAULT_VIEW, { pitch: Number.NaN }), RangeError);
    assert.throws(() => applyViewSettings(LIBRARY_DEFAULT_VIEW, { fovMode: 'wide' }), RangeError);
  });
});
