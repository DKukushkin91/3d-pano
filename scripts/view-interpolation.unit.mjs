import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EnumFovMode,
  areViewsClose,
  createViewPath,
  shiftView,
  shortestYawDelta,
  viewAlongPath,
  viewOffset,
} from '../dist/internal.js';

const TOLERANCE = 1e-9;

const createView = (fields = {}) => ({
  yaw: 0,
  pitch: 0,
  roll: 0,
  fov: 90,
  fovMode: EnumFovMode.Max,
  ...fields,
});

const assertClose = (actual, expected, tolerance = TOLERANCE) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${String(expected)}, got ${String(actual)}`);
};

const yawsAlong = (path, steps = 20) =>
  Array.from({ length: steps + 1 }, (_value, index) => viewAlongPath(path, index / steps).yaw);

describe('camera-motion · Путь по горизонтали', () => {
  it('Через ноль: от yaw 350 к 10 камера идёт вправо на 20° через 0', () => {
    const path = createViewPath(createView({ yaw: -10 }), createView({ yaw: 10 }), undefined, 0);

    assert.equal(path.toYaw - path.fromYaw, 20);
    assertClose(viewAlongPath(path, 0.5).yaw, 0);
  });

  it('кратчайшая дуга не длиннее 180° в любую сторону', () => {
    assertClose(shortestYawDelta(170, -170, 0), 20);
    assertClose(shortestYawDelta(-170, 170, 0), -20);
    assertClose(shortestYawDelta(10, 200, 0), -170);
  });

  it('Цель ровно сзади: без вращения камера поворачивает вправо', () => {
    const path = createViewPath(createView({ yaw: 0 }), createView({ yaw: 180 }), undefined, 0);

    assert.equal(path.toYaw - path.fromYaw, 180);
    assertClose(viewAlongPath(path, 0.25).yaw, 45);
    assert.equal(shortestYawDelta(30, -150, 0), 180);
  });

  it('Цель сзади во время вращения: камера продолжает вращение влево', () => {
    const path = createViewPath(createView({ yaw: 0 }), createView({ yaw: 180 }), undefined, -1);

    assert.equal(path.toYaw - path.fromYaw, -180);
    assertClose(viewAlongPath(path, 0.25).yaw, -45);
    assert.equal(shortestYawDelta(0, 180, 1), 180);
  });

  it('разница чуть меньше 180° не считается «ровно сзади»', () => {
    assertClose(shortestYawDelta(0, 179.9, -1), 179.9);
  });

  it('Ограниченный диапазон: от 130 к −130 при диапазоне [−170, 170] камера идёт через 0', () => {
    const path = createViewPath(createView({ yaw: 130 }), createView({ yaw: -130 }), [-170, 170], 0);
    const yaws = yawsAlong(path);

    assertClose(viewAlongPath(path, 0.5).yaw, 0);
    assert.ok(yaws.every((yaw) => yaw >= -130 - TOLERANCE && yaw <= 130 + TOLERANCE));
    assert.ok(yaws.every((yaw, index) => index === 0 || yaw < yaws[index - 1]));
  });

  it('диапазон через ±180: от 160 к −160 при диапазоне [150, 210] камера идёт через 180', () => {
    const path = createViewPath(createView({ yaw: 160 }), createView({ yaw: -160 }), [150, 210], 0);

    assertClose(Math.abs(viewAlongPath(path, 0.5).yaw), 180);
  });
});

describe('camera-motion · Поля вида при повороте (интерполяция)', () => {
  it('доли 0 и 1 дают начало и конец точно, крен и режим FOV берутся из начала', () => {
    const start = createView({ yaw: -10, pitch: 5, roll: 7, fov: 90 });
    const end = createView({ yaw: 40, pitch: -10, roll: 0, fov: 60, fovMode: EnumFovMode.Vertical });
    const path = createViewPath(start, end, undefined, 0);

    assert.deepEqual(viewAlongPath(path, 0), start);
    assert.deepEqual(viewAlongPath(path, 1), { ...start, yaw: 40, pitch: -10, fov: 60 });
  });

  it('yaw, pitch и fov проходят одну долю пути одновременно', () => {
    const path = createViewPath(createView(), createView({ yaw: 40, pitch: -10, fov: 60 }), undefined, 0);
    const middle = viewAlongPath(path, 0.5);

    assertClose(middle.yaw, 20);
    assertClose(middle.pitch, -5);
    assertClose(middle.fov, 75);
  });

  it('доля больше 1 продолжает путь за цель — ограничения применяет вызывающий', () => {
    const path = createViewPath(createView(), createView({ pitch: -10 }), undefined, 0);

    assertClose(viewAlongPath(path, 1.1).pitch, -11);
  });
});

describe('camera-motion · Мгновенный поворот (совпадение видов)', () => {
  it('виды с разницей меньше 10⁻⁶° совпадают, yaw 180 и −180 — одно направление', () => {
    assert.ok(areViewsClose(createView({ yaw: 40 }), createView({ yaw: 40 + 1e-7 })));
    assert.ok(areViewsClose(createView({ yaw: 180 }), createView({ yaw: -180 })));
    assert.ok(!areViewsClose(createView({ yaw: 40 }), createView({ yaw: 40.00001 })));
    assert.ok(!areViewsClose(createView({ fov: 90 }), createView({ fov: 89 })));
  });
});

describe('scene-navigation · Инерция при смене (разница видов)', () => {
  it('разница по yaw — по кратчайшей дуге, сдвиг на долю разницы возвращает вид к цели', () => {
    const from = createView({ yaw: 170, pitch: 10, fov: 80 });
    const to = createView({ yaw: -170, pitch: -5, fov: 90 });
    const offset = viewOffset(from, to);

    assert.deepEqual(offset, { yaw: 20, pitch: -15, fov: 10 });
    assert.deepEqual(shiftView(from, offset, 1), { ...from, yaw: -170, pitch: -5, fov: 90 });
    assert.deepEqual(shiftView(from, offset, 0), from);
    assertClose(shiftView(from, offset, 0.5).yaw, 180);
  });
});
