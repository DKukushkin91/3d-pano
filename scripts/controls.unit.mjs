import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EnumFovMode,
  EnumKeyAction,
  INERTIA_MAX_SPEED_DEGREES_PER_SECOND,
  STILL_MOTION,
  applyMotion,
  decayVelocity,
  dragView,
  isMoving,
  keyActionFromKey,
  pinchFov,
  releaseVelocity,
  stepMotion,
  targetMotion,
  wheelDeltaPixels,
  wheelFov,
} from '../dist/internal.js';

const VIEWPORT = { width: 1600, height: 900 };
const CENTER = { x: 800, y: 450 };
const START_VIEW = { yaw: 0, pitch: 0, roll: 0, fov: 90, fovMode: EnumFovMode.Horizontal };

const assertClose = (actual, expected, tolerance = 1e-6) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${String(actual)} to be within ${String(tolerance)} of ${String(expected)}`,
  );
};

const halfTangent = (fovDegrees) => Math.tan((fovDegrees * Math.PI) / 360);

describe('user-controls · Перетаскивание', () => {
  it('Тянем вправо: изображение идёт за указателем, yaw уменьшается', () => {
    const view = dragView({ view: START_VIEW, pointer: CENTER }, { x: 1000, y: 450 }, VIEWPORT, false);

    assert.ok(view.yaw < 0);
    assertClose(view.pitch, 0);
  });

  it('точка под указателем остаётся под ним: смещение на полэкрана поворачивает на половину FOV', () => {
    const view = dragView({ view: START_VIEW, pointer: CENTER }, { x: 1600, y: 450 }, VIEWPORT, false);

    assertClose(view.yaw, -45);
  });

  it('тянем вниз — смотрим выше', () => {
    const view = dragView({ view: START_VIEW, pointer: CENTER }, { x: 800, y: 600 }, VIEWPORT, false);

    assert.ok(view.pitch > 0);
  });

  it('без движения вид не меняется', () => {
    const view = dragView(
      { view: START_VIEW, pointer: { x: 123, y: 456 } },
      { x: 123, y: 456 },
      VIEWPORT,
      false,
    );

    assertClose(view.yaw, 0);
    assertClose(view.pitch, 0);
  });

  it('у надира вертикальное движение поднимает взгляд, а не крутит камеру', () => {
    const nadirView = { ...START_VIEW, pitch: -90 };
    const view = dragView({ view: nadirView, pointer: CENTER }, { x: 800, y: 700 }, VIEWPORT, false);

    assert.ok(view.pitch > -90);
    assertClose(view.yaw, 0);
  });

  it('у зенита горизонтальное движение меняет yaw на угол под указателем, без скачков', () => {
    const zenithView = { ...START_VIEW, pitch: 89 };
    const view = dragView({ view: zenithView, pointer: CENTER }, { x: 820, y: 450 }, VIEWPORT, false);

    assert.ok(view.yaw < 0 && view.yaw > -2, `yaw ${String(view.yaw)}`);
    assertClose(view.pitch, 89);
  });

  it('Инверсия: при invertDrag тянем вправо — yaw увеличивается', () => {
    const view = dragView({ view: START_VIEW, pointer: CENTER }, { x: 1000, y: 450 }, VIEWPORT, true);

    assert.ok(view.yaw > 0);
  });
});

describe('user-controls · Инерция', () => {
  it('Бросок: скорость по образцам за последние 100 мс', () => {
    const samples = [
      { timeMs: 0, yaw: 0, pitch: 0 },
      { timeMs: 950, yaw: 9, pitch: 0 },
      { timeMs: 1000, yaw: 10, pitch: -1 },
    ];
    const velocity = releaseVelocity(samples, 1000);

    assertClose(velocity.yaw, 20);
    assertClose(velocity.pitch, -20);
  });

  it('указатель стоял перед отпусканием — броска нет', () => {
    const samples = [
      { timeMs: 0, yaw: 0, pitch: 0 },
      { timeMs: 100, yaw: 10, pitch: 0 },
    ];

    assert.equal(isMoving(releaseVelocity(samples, 500)), false);
  });

  it('скорость броска ограничена', () => {
    const velocity = releaseVelocity(
      [
        { timeMs: 0, yaw: 0, pitch: 0 },
        { timeMs: 10, yaw: 100, pitch: 0 },
      ],
      10,
    );

    assertClose(Math.hypot(velocity.yaw, velocity.pitch), INERTIA_MAX_SPEED_DEGREES_PER_SECOND);
  });

  it('вращение затухает и останавливается само', () => {
    let velocity = { yaw: 90, pitch: 0 };
    let frames = 0;

    while (isMoving(velocity) && frames < 1000) {
      velocity = decayVelocity(velocity, 1 / 60, 1);
      frames += 1;
    }

    assert.ok(frames > 10 && frames < 120, `stopped after ${String(frames)} frames`);
  });

  it('inertiaFriction 2 гасит скорость вдвое быстрее в логарифмическом смысле', () => {
    const slow = decayVelocity({ yaw: 100, pitch: 0 }, 0.1, 1);
    const fast = decayVelocity({ yaw: 100, pitch: 0 }, 0.1, 2);

    assertClose(Math.log(fast.yaw / 100), 2 * Math.log(slow.yaw / 100));
  });
});

describe('user-controls · Колесо', () => {
  it('Приближение колесом: прокрутка вперёд уменьшает FOV, назад — увеличивает', () => {
    assert.ok(wheelFov(90, -100, 1) < 90);
    assert.ok(wheelFov(90, 100, 1) > 90);
  });

  it('строки и страницы приводятся к пикселям', () => {
    assert.equal(wheelDeltaPixels(3, 1), 48);
    assert.equal(wheelDeltaPixels(1, 2), 800);
    assert.equal(wheelDeltaPixels(53, 0), 53);
  });

  it('Быстрее колесо: при wheelSpeed 2 tan(fov/2) меняется вдвое сильнее', () => {
    const normal = Math.log(halfTangent(wheelFov(90, -100, 1)) / halfTangent(90));
    const doubled = Math.log(halfTangent(wheelFov(90, -100, 2)) / halfTangent(90));

    assertClose(doubled, 2 * normal);
  });
});

describe('user-controls · Щипок', () => {
  it('Раздвигаем пальцы: вдвое шире — tan(fov/2) вдвое меньше', () => {
    const fov = pinchFov(90, 100, 200);

    assert.ok(fov < 90);
    assertClose(halfTangent(fov), halfTangent(90) / 2);
  });

  it('нулевое расстояние не ломает FOV', () => {
    assert.equal(pinchFov(90, 100, 0), 90);
  });
});

describe('user-controls · Клавиатура', () => {
  it('стрелки и +/− превращаются в действия, прочие клавиши — нет', () => {
    assert.equal(keyActionFromKey('ArrowLeft'), EnumKeyAction.TurnLeft);
    assert.equal(keyActionFromKey('='), EnumKeyAction.ZoomIn);
    assert.equal(keyActionFromKey('-'), EnumKeyAction.ZoomOut);
    assert.equal(keyActionFromKey('Enter'), undefined);
  });

  it('Стрелка влево: камера плавно разгоняется влево и тормозит после отпускания', () => {
    const target = targetMotion(new Set([EnumKeyAction.TurnLeft]), 1);
    let motion = STILL_MOTION;

    for (let frame = 0; frame < 30; frame += 1) {
      motion = stepMotion(motion, target, 1 / 60);
    }

    assert.ok(motion.yaw < 0);

    const moved = applyMotion(START_VIEW, motion, 1 / 60);

    assert.ok(moved.yaw < 0);

    for (let frame = 0; frame < 120; frame += 1) {
      motion = stepMotion(motion, targetMotion(new Set(), 1), 1 / 60);
    }

    assert.deepEqual(motion, STILL_MOTION);
  });

  it('+ приближает, keyboardSpeed ускоряет', () => {
    const zoomIn = targetMotion(new Set([EnumKeyAction.ZoomIn]), 1);
    const fasterTurn = targetMotion(new Set([EnumKeyAction.TurnRight]), 2);

    assert.ok(applyMotion(START_VIEW, zoomIn, 0.5).fov < 90);
    assert.equal(fasterTurn.yaw, 2 * targetMotion(new Set([EnumKeyAction.TurnRight]), 1).yaw);
  });
});
