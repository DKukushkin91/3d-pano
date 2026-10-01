import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_BLEND_DURATION_MS,
  EnumEasing,
  EnumFovMode,
  EnumSceneView,
  EnumTransitionType,
  isTransitionFinished,
  resolveEasing,
  resolveShowSceneOptions,
  resolveViewAfterSwitch,
  transitionWeight,
} from '../dist/internal.js';

const TOLERANCE = 1e-9;
const CURRENT_VIEW = { yaw: 120, pitch: -10, roll: 0, fov: 60, fovMode: EnumFovMode.Max };
const BEDROOM_START_VIEW = { yaw: 30, pitch: 0, roll: 0, fov: 80, fovMode: EnumFovMode.Max };
const square = (progress) => progress * progress;

const assertRangeError = (options, optionName) => {
  assert.throws(
    () => resolveShowSceneOptions(options),
    (error) => {
      assert.ok(error instanceof RangeError, `expected RangeError, got ${String(error)}`);
      assert.match(error.message, /^3d-pano: /);
      assert.ok(error.message.includes(optionName), `"${error.message}" must name ${optionName}`);

      return true;
    },
  );
};

describe('scene-transitions · Словари переходов', () => {
  it('Константа или строка: EnumTransitionType.Blend и "blend" разрешаются одинаково', () => {
    assert.deepEqual(Object.values(EnumTransitionType), ['cut', 'blend']);

    const fromConstant = resolveShowSceneOptions({ transition: { type: EnumTransitionType.Blend } });
    const fromString = resolveShowSceneOptions({ transition: { type: 'blend' } });

    assert.deepEqual(fromConstant, fromString);
  });
});

describe('scene-navigation · Словари режима вида', () => {
  it('Константа или строка: EnumSceneView.Keep и "keep" разрешаются одинаково', () => {
    assert.deepEqual(Object.values(EnumSceneView), ['scene', 'keep']);
    assert.equal(resolveShowSceneOptions({ view: EnumSceneView.Keep }).view, 'keep');
    assert.equal(resolveShowSceneOptions({ view: 'keep' }).view, 'keep');
  });
});

describe('scene-transitions · Мгновенная смена', () => {
  it('Переход по умолчанию: без transition — cut, вид сцены, без сохранения инерции', () => {
    const resolved = resolveShowSceneOptions(undefined);

    assert.equal(resolved.transition.type, 'cut');
    assert.equal(resolved.transition.durationMs, 0);
    assert.equal(resolved.view, 'scene');
    assert.equal(resolved.keepMotion, false);
    assert.equal(transitionWeight(resolved.transition, 0), 1);
  });
});

describe('scene-transitions · Смешивание', () => {
  it('Смешивание по умолчанию: 500 мс с плавностью sine-in-out', () => {
    const { transition } = resolveShowSceneOptions({ transition: { type: 'blend' } });

    assert.equal(transition.type, 'blend');
    assert.equal(transition.durationMs, DEFAULT_BLEND_DURATION_MS);
    assert.equal(DEFAULT_BLEND_DURATION_MS, 500);
    assert.equal(transition.easing, resolveEasing(EnumEasing.SineInOut));
  });

  it('durationMs: 0 равнозначен cut', () => {
    const { transition } = resolveShowSceneOptions({ transition: { type: 'blend', durationMs: 0 } });

    assert.equal(transition.type, 'cut');
  });

  it('Смешивание с перелётом: вес back-out ограничен 1', () => {
    const { transition } = resolveShowSceneOptions({
      transition: { type: 'blend', durationMs: 1000, easing: 'back-out' },
    });

    assert.ok(resolveEasing('back-out')(0.5) > 1);
    assert.equal(transitionWeight(transition, 500), 1);
  });

  it('вес — 0 в начале и 1 в конце, время за пределами длительности ограничено', () => {
    const { transition } = resolveShowSceneOptions({ transition: { type: 'blend', durationMs: 300 } });

    assert.equal(transitionWeight(transition, 0), 0);
    assert.equal(transitionWeight(transition, 300), 1);
    assert.equal(transitionWeight(transition, 900), 1);
    assert.equal(transitionWeight(transition, -50), 0);
    assert.ok(!isTransitionFinished(transition, 299));
    assert.ok(isTransitionFinished(transition, 300));
  });
});

describe('easing · Своя функция плавности', () => {
  it('Своя функция: вес смешивания в середине перехода равен 0.25', () => {
    const { transition } = resolveShowSceneOptions({
      transition: { type: 'blend', durationMs: 800, easing: square },
    });

    assert.ok(Math.abs(transitionWeight(transition, 400) - 0.25) <= TOLERANCE);
  });
});

describe('scene-navigation · Проверка опций смены сцены', () => {
  it('Отрицательная длительность: RangeError с именем durationMs', () => {
    assertRangeError({ transition: { type: 'blend', durationMs: -1 } }, 'durationMs');
  });

  it('нечисловая и бесконечная длительность — RangeError', () => {
    assertRangeError({ transition: { type: 'blend', durationMs: Number.NaN } }, 'durationMs');
    assertRangeError({ transition: { type: 'blend', durationMs: Number.POSITIVE_INFINITY } }, 'durationMs');
  });

  it('неизвестный transition.type и неизвестная плавность — RangeError', () => {
    assertRangeError({ transition: { type: 'fade' } }, 'transition.type');
    assertRangeError({ transition: { type: 'blend', easing: 'ease-in' } }, 'easing');
  });

  it('view не scene, не keep и не объект вида — RangeError', () => {
    assertRangeError({ view: 'start' }, 'view');
    assertRangeError({ view: null }, 'view');
    assertRangeError({ view: [] }, 'view');
  });

  it('объект вида с нечисловым углом или неизвестным fovMode — RangeError', () => {
    assert.throws(() => resolveShowSceneOptions({ view: { yaw: Number.NaN } }), RangeError);
    assert.throws(() => resolveShowSceneOptions({ view: { fovMode: 'wide' } }), RangeError);
  });
});

describe('scene-navigation · Вид после смены', () => {
  it('Смена ремонта: keep оставляет текущий вид', () => {
    assert.deepEqual(resolveViewAfterSwitch('keep', CURRENT_VIEW, BEDROOM_START_VIEW), CURRENT_VIEW);
  });

  it('scene — стартовый вид новой сцены', () => {
    assert.deepEqual(resolveViewAfterSwitch('scene', CURRENT_VIEW, BEDROOM_START_VIEW), BEDROOM_START_VIEW);
  });

  it('Явный вид с недостающими полями: yaw 200 поверх стартового вида, fov 80', () => {
    const { view } = resolveShowSceneOptions({ view: { yaw: 200 } });
    const resolved = resolveViewAfterSwitch(view, CURRENT_VIEW, BEDROOM_START_VIEW);

    assert.equal(resolved.yaw, 200);
    assert.equal(resolved.pitch, 0);
    assert.equal(resolved.fov, 80);
  });

  it('объект вида копируется: изменение объекта хоста после вызова не влияет', () => {
    const hostView = { yaw: 200 };
    const { view } = resolveShowSceneOptions({ view: hostView });

    hostView.yaw = 10;

    assert.equal(resolveViewAfterSwitch(view, CURRENT_VIEW, BEDROOM_START_VIEW).yaw, 200);
  });
});
