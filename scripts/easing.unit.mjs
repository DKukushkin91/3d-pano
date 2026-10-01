import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EnumEasing, isEasingName, resolveEasing } from '../dist/internal.js';

const TOLERANCE = 1e-9;
const EASING_NAMES = Object.values(EnumEasing);
const IN_OUT_NAMES = EASING_NAMES.filter((name) => name.endsWith('-in-out'));
const OVERSHOOTING_FAMILIES = ['back', 'elastic', 'bounce'];
const MONOTONIC_NAMES = EASING_NAMES.filter(
  (name) => !OVERSHOOTING_FAMILIES.some((family) => name.startsWith(family)),
);
const GRID_STEPS = 200;
const BACK_OVERSHOOT = 1.70158;
const square = (progress) => progress * progress;
const double = (progress) => progress * 2;

const assertClose = (actual, expected, message) => {
  assert.ok(
    Math.abs(actual - expected) <= TOLERANCE,
    `${message}: expected ${String(actual)} to be within ${String(TOLERANCE)} of ${String(expected)}`,
  );
};

const valueAt = (name, progress) => resolveEasing(name)(progress);

const IN_VALUES_AT_HALF = {
  'sine-in': 1 - Math.cos(Math.PI / 4),
  'quad-in': 0.25,
  'cubic-in': 0.125,
  'quart-in': 0.0625,
  'quint-in': 0.03125,
  'expo-in': 2 ** -5,
  'circ-in': 1 - Math.sqrt(0.75),
  'back-in': 0.25 * ((BACK_OVERSHOOT + 1) * 0.5 - BACK_OVERSHOOT),
  'elastic-in': -(2 ** -5) * Math.sin(((-0.5 - 0.075) * 2 * Math.PI) / 0.3),
  'bounce-in': 1 - 0.765625,
};

describe('easing · Именованные функции плавности', () => {
  it('словарь содержит linear и десять семейств с -in, -out, -in-out', () => {
    assert.equal(EASING_NAMES.length, 31);
    assert.ok(EASING_NAMES.includes('linear'));
    assert.ok(EASING_NAMES.every((name) => /^[a-z]+(?:-in|-out|-in-out)?$/.test(name)));
    assert.equal(EnumEasing.CubicOut, 'cubic-out');
  });

  it('Концы кривой: каждая функция даёт 0 в точке 0 и 1 в точке 1', () => {
    for (const name of EASING_NAMES) {
      assertClose(valueAt(name, 0), 0, `${name}(0)`);
      assertClose(valueAt(name, 1), 1, `${name}(1)`);
    }
  });

  it('кривые -in-out проходят через 0.5 в середине', () => {
    for (const name of IN_OUT_NAMES) {
      assertClose(valueAt(name, 0.5), 0.5, `${name}(0.5)`);
    }
  });

  it('значения -in в середине совпадают с формулами', () => {
    for (const [name, expected] of Object.entries(IN_VALUES_AT_HALF)) {
      assertClose(valueAt(name, 0.5), expected, `${name}(0.5)`);
    }
  });

  it('-out — отражение -in: out(t) = 1 − in(1 − t)', () => {
    for (const family of Object.keys(IN_VALUES_AT_HALF).map((name) => name.replace(/-in$/, ''))) {
      for (const progress of [0.1, 0.3, 0.5, 0.8]) {
        assertClose(
          valueAt(`${family}-out`, progress),
          1 - valueAt(`${family}-in`, 1 - progress),
          `${family}-out(${String(progress)})`,
        );
      }
    }
  });

  it('известные значения: cubic-out(0.5) = 0.875, bounce-out(0.5) = 0.765625, sine-in-out(0.25) = (1 − cos(π/4)) / 2', () => {
    assertClose(valueAt(EnumEasing.CubicOut, 0.5), 0.875, 'cubic-out');
    assertClose(valueAt(EnumEasing.BounceOut, 0.5), 0.765625, 'bounce-out');
    assertClose(valueAt(EnumEasing.SineInOut, 0.25), (1 - Math.cos(Math.PI / 4)) / 2, 'sine-in-out');
  });

  it('кривые без перелёта не убывают', () => {
    for (const name of MONOTONIC_NAMES) {
      let previous = valueAt(name, 0);

      for (let step = 1; step <= GRID_STEPS; step += 1) {
        const current = valueAt(name, step / GRID_STEPS);

        assert.ok(current >= previous - TOLERANCE, `${name} decreases at ${String(step / GRID_STEPS)}`);
        previous = current;
      }
    }
  });

  it('Именованная плавность: константа и строка дают одну и ту же функцию', () => {
    assert.equal(resolveEasing(EnumEasing.CubicOut), resolveEasing('cubic-out'));
    assert.ok(isEasingName('sine-in-out'));
    assert.ok(!isEasingName('sine'));
    assert.ok(!isEasingName('toString'));
  });

  it('неизвестное имя — RangeError с префиксом 3d-pano', () => {
    assert.throws(
      () => resolveEasing('ease-in'),
      (error) => {
        assert.ok(error instanceof RangeError);
        assert.match(error.message, /^3d-pano: easing/);

        return true;
      },
    );
  });
});

describe('easing · Своя функция плавности', () => {
  it('Своя функция возвращается как есть, без ограничения результата', () => {
    assert.equal(resolveEasing(square), square);
    assert.equal(resolveEasing(double)(1), 2);
  });
});
