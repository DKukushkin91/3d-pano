import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EnumBoundsMode,
  EnumFovMode,
  LIBRARY_DEFAULT_LIMITS,
  constrainView,
  minimumFovForPixelZoom,
  pixelsPerRadianForCube,
  pixelsPerRadianForEquirect,
} from '../dist/internal.js';

const TOLERANCE = 1e-6;
const VIEWPORT = { viewportWidth: 1600, viewportHeight: 900 };

const assertClose = (actual, expected, tolerance = TOLERANCE) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${String(actual)} to be within ${String(tolerance)} of ${String(expected)}`,
  );
};

const rangeLimits = (bounds) => ({ ...LIBRARY_DEFAULT_LIMITS, bounds });

const createView = (fields = {}) => ({
  yaw: 0,
  pitch: 0,
  roll: 0,
  fov: 90,
  fovMode: EnumFovMode.Max,
  ...fields,
});

const createContext = (fields = {}) => ({
  limits: LIBRARY_DEFAULT_LIMITS,
  ...VIEWPORT,
  sourcePixelsPerRadian: null,
  previousFov: null,
  ...fields,
});

describe('camera-view · Параметры вида', () => {
  it('нормализует yaw и держит pitch в −90…90', () => {
    const view = constrainView(createView({ yaw: 400, pitch: 120 }), createContext());

    assert.equal(view.yaw, 40);
    assert.equal(view.pitch, 90);
  });
});

describe('camera-view · Ограничение FOV', () => {
  it('Слишком сильное отдаление: при пределах [30, 120] fov 150 становится 120', () => {
    assert.equal(constrainView(createView({ fov: 150 }), createContext()).fov, 120);
  });

  it('слишком сильное приближение упирается в нижний предел', () => {
    assert.equal(constrainView(createView({ fov: 10 }), createContext()).fov, 30);
  });
});

describe('camera-view · Ограничение увеличения по разрешению источника', () => {
  const previewDensity = pixelsPerRadianForEquirect(512);
  const fullDensity = pixelsPerRadianForEquirect(8192);

  it('плотность куба в центре грани — половина размера грани', () => {
    assert.equal(pixelsPerRadianForCube(2048), 1024);
  });

  it('минимальный FOV по пикселям: в центре пиксель источника не крупнее maxPixelZoom CSS-пикселей', () => {
    const view = createView({ fovMode: EnumFovMode.Vertical });
    const minimumFov = minimumFovForPixelZoom(view, createContext({ sourcePixelsPerRadian: previewDensity }));
    const cssPixelsPerRadian = VIEWPORT.viewportHeight / 2 / Math.tan(((minimumFov ?? 0) * Math.PI) / 360);

    assertClose(cssPixelsPerRadian / previewDensity, LIBRARY_DEFAULT_LIMITS.maxPixelZoom);
  });

  it('Маленькое превью вместо панорамы: приближение останавливается, но вид не отдаляется сам', () => {
    const context = createContext({ sourcePixelsPerRadian: previewDensity, previousFov: 90 });

    assert.equal(constrainView(createView({ fov: 60 }), context).fov, 90);
    assert.equal(constrainView(createView({ fov: 110 }), context).fov, 110);
  });

  it('после загрузки основного изображения приближение снова доступно до большего из двух пределов', () => {
    const context = createContext({ sourcePixelsPerRadian: fullDensity, previousFov: 90 });
    const pixelFloor = minimumFovForPixelZoom(createView(), context) ?? 0;

    assert.equal(constrainView(createView({ fov: 60 }), context).fov, 60);
    assertClose(constrainView(createView({ fov: 20 }), context).fov, Math.max(30, pixelFloor));
  });

  it('пока плотность неизвестна, действует только limits.fov', () => {
    assert.equal(constrainView(createView({ fov: 40 }), createContext()).fov, 40);
  });
});

describe('camera-view · Границы обзора', () => {
  it('auto и none для полной сферы не ограничивают yaw', () => {
    for (const bounds of [EnumBoundsMode.Auto, EnumBoundsMode.None]) {
      assert.equal(
        constrainView(createView({ yaw: 170 }), createContext({ limits: rangeLimits(bounds) })).yaw,
        170,
      );
    }
  });

  it('Ограничение по горизонту: правый край кадра останавливается на yaw 90', () => {
    const context = createContext({ limits: rangeLimits({ yaw: [-90, 90] }) });
    const view = constrainView(createView({ yaw: 100, fov: 90, fovMode: EnumFovMode.Horizontal }), context);

    assertClose(view.yaw, 45);
  });

  it('кадр шире диапазона: FOV уменьшается до ширины диапазона', () => {
    const context = createContext({ limits: rangeLimits({ yaw: [-30, 30] }) });
    const view = constrainView(createView({ yaw: 10, fov: 90, fovMode: EnumFovMode.Horizontal }), context);

    assertClose(view.fov, 60);
    assertClose(view.yaw, 0);
  });

  it('диапазон pitch держит верх и низ кадра', () => {
    const context = createContext({ limits: rangeLimits({ pitch: [-30, 40] }) });
    const view = constrainView(createView({ pitch: 35, fov: 40, fovMode: EnumFovMode.Vertical }), context);

    assertClose(view.pitch, 20);
  });

  it('диапазон через заднюю сторону [150, 210] работает с yaw −175', () => {
    const context = createContext({ limits: rangeLimits({ yaw: [150, 210] }) });
    const view = constrainView(createView({ yaw: -175, fov: 30, fovMode: EnumFovMode.Horizontal }), context);

    assertClose(view.yaw, -175);
  });
});
