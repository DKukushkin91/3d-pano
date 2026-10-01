import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CUBE_FACES,
  EnumCubeFace,
  EnumFovMode,
  anglesFromDirection,
  cameraBasisFromAngles,
  cubeFaceFromDirection,
  directionFromAngles,
  directionFromCubeFace,
  directionFromEquirect,
  directionFromScreen,
  equirectFromDirection,
  fovFromHalfTangents,
  halfTangentsFromFov,
  normalizeVector,
  normalizeYaw,
  screenFromDirection,
  toDegrees,
  toRadians,
} from '../dist/internal.js';

const TOLERANCE = 1e-9;
const LANDSCAPE = { width: 1600, height: 900 };
const PORTRAIT = { width: 390, height: 844 };

const assertClose = (actual, expected, tolerance = TOLERANCE) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${String(actual)} to be within ${String(tolerance)} of ${String(expected)}`,
  );
};

const assertSameDirection = (actual, expected) => {
  const first = normalizeVector(actual);
  const second = normalizeVector(expected);

  assertClose(first.x, second.x);
  assertClose(first.y, second.y);
  assertClose(first.z, second.z);
};

const createCamera = ({ yaw = 0, pitch = 0, roll = 0, fov = 90, fovMode = EnumFovMode.Max }, viewport) => ({
  basis: cameraBasisFromAngles(toRadians(yaw), toRadians(pitch), toRadians(roll)),
  halfTangents: halfTangentsFromFov(toRadians(fov), fovMode, viewport.width / viewport.height),
});

const projectAngles = (yaw, pitch, view, viewport) => {
  const camera = createCamera(view, viewport);

  return screenFromDirection(
    directionFromAngles(toRadians(yaw), toRadians(pitch)),
    viewport,
    camera.basis,
    camera.halfTangents,
  );
};

describe('camera-view · Параметры вида', () => {
  const cases = [
    [400, 40],
    [-180, 180],
    [180, 180],
    [-190, 170],
    [720, 0],
    [-45, -45],
  ];

  for (const [input, expected] of cases) {
    it(`Поворот на полный круг: normalizeYaw(${String(input)}) = ${String(expected)}`, () => {
      assertClose(normalizeYaw(input), expected);
    });
  }

  it('переводит градусы в радианы и обратно без потерь', () => {
    assertClose(toRadians(180), Math.PI);
    assertClose(toDegrees(toRadians(37.5)), 37.5);
  });
});

describe('camera-view · Единицы и знаки углов', () => {
  it('yaw 0, pitch 0 смотрит вдоль +Z, yaw 90 — вдоль +X', () => {
    assertSameDirection(directionFromAngles(0, 0), { x: 0, y: 0, z: 1 });
    assertSameDirection(directionFromAngles(toRadians(90), 0), { x: 1, y: 0, z: 0 });
  });

  it('Взгляд вверх: при pitch 60 в центре кадра точка выше горизонта', () => {
    const camera = createCamera({ pitch: 60 }, LANDSCAPE);
    const center = directionFromScreen(800, 450, LANDSCAPE, camera.basis, camera.halfTangents);

    assert.ok(center.y > 0);
    assertClose(toDegrees(anglesFromDirection(center).pitch), 60);
  });

  it('положительный roll наклоняет горизонт по часовой стрелке', () => {
    const view = { roll: 20 };
    const right = projectAngles(30, 0, view, LANDSCAPE);
    const left = projectAngles(-30, 0, view, LANDSCAPE);

    assert.ok(right !== null && left !== null);
    assert.ok(right.y > LANDSCAPE.height / 2, 'правая часть горизонта ниже центра');
    assert.ok(left.y < LANDSCAPE.height / 2, 'левая часть горизонта выше центра');
  });
});

describe('camera-view · Режимы FOV', () => {
  it('FOV по большей стороне на телефоне: вертикаль 90°, горизонталь меньше', () => {
    const halfTangents = halfTangentsFromFov(
      toRadians(90),
      EnumFovMode.Max,
      PORTRAIT.width / PORTRAIT.height,
    );

    assertClose(halfTangents.height, 1);
    assert.ok(halfTangents.width < 1);
  });

  it('по большей стороне в альбомном кадре — это ширина', () => {
    const halfTangents = halfTangentsFromFov(
      toRadians(90),
      EnumFovMode.Max,
      LANDSCAPE.width / LANDSCAPE.height,
    );

    assertClose(halfTangents.width, 1);
    assert.ok(halfTangents.height < 1);
  });

  it('диагональный режим относит угол к диагонали кадра', () => {
    const halfTangents = halfTangentsFromFov(toRadians(90), EnumFovMode.Diagonal, 16 / 9);

    assertClose(Math.hypot(halfTangents.width, halfTangents.height), 1);
    assertClose(halfTangents.width / halfTangents.height, 16 / 9);
  });

  for (const fovMode of Object.values(EnumFovMode)) {
    for (const aspect of [16 / 9, 9 / 19.5, 1]) {
      it(`fovFromHalfTangents обратна halfTangentsFromFov: ${fovMode}, aspect ${aspect.toFixed(2)}`, () => {
        const fov = toRadians(73);

        assertClose(fovFromHalfTangents(halfTangentsFromFov(fov, fovMode, aspect), fovMode, aspect), fov);
      });
    }
  }
});

describe('camera-view · Точка на экране', () => {
  it('Центр кадра: project точки взгляда даёт центр контейнера', () => {
    const point = projectAngles(30, 10, { yaw: 30, pitch: 10 }, LANDSCAPE);

    assert.ok(point !== null);
    assertClose(point.x, LANDSCAPE.width / 2, 1e-6);
    assertClose(point.y, LANDSCAPE.height / 2, 1e-6);
    assert.equal(point.isInView, true);
  });

  it('Точка сбоку за краем кадра: правее контейнера и isInView false', () => {
    const point = projectAngles(70, 0, { fov: 90 }, LANDSCAPE);

    assert.ok(point !== null);
    assert.ok(point.x > LANDSCAPE.width);
    assert.equal(point.isInView, false);
  });

  it('Точка позади: project возвращает null', () => {
    assert.equal(projectAngles(180, 0, {}, LANDSCAPE), null);
  });
});

describe('camera-view · Точка сферы под пикселем', () => {
  const views = [
    { yaw: 0, pitch: 0, roll: 0, fov: 90 },
    { yaw: 135, pitch: -40, roll: 0, fov: 60, fovMode: EnumFovMode.Vertical },
    { yaw: -70, pitch: 75, roll: 15, fov: 110, fovMode: EnumFovMode.Diagonal },
  ];
  const pixels = [
    [0, 0],
    [1600, 900],
    [800, 450],
    [123.5, 777.25],
    [1599, 1],
  ];

  for (const view of views) {
    it(`project(unproject(x, y)) возвращает тот же пиксель с точностью 0,5 px: yaw ${String(view.yaw)}`, () => {
      const camera = createCamera(view, LANDSCAPE);

      for (const [x, y] of pixels) {
        const direction = directionFromScreen(x, y, LANDSCAPE, camera.basis, camera.halfTangents);
        const point = screenFromDirection(direction, LANDSCAPE, camera.basis, camera.halfTangents);

        assert.ok(point !== null);
        assertClose(point.x, x, 0.5);
        assertClose(point.y, y, 0.5);
      }
    });
  }
});

describe('panorama-sources · Ориентация граней куба', () => {
  const faceCenterYaw = [
    [EnumCubeFace.Front, 0],
    [EnumCubeFace.Right, 90],
    [EnumCubeFace.Back, 180],
    [EnumCubeFace.Left, -90],
  ];

  for (const [face, yaw] of faceCenterYaw) {
    it(`центр грани ${face} — yaw ${String(yaw)}, pitch 0`, () => {
      const angles = anglesFromDirection(directionFromCubeFace({ face, s: 0, t: 0 }));

      assertClose(normalizeYaw(toDegrees(angles.yaw)), normalizeYaw(yaw));
      assertClose(toDegrees(angles.pitch), 0);
    });
  }

  it('центры up и down — зенит и надир', () => {
    assertSameDirection(directionFromCubeFace({ face: EnumCubeFace.Up, s: 0, t: 0 }), { x: 0, y: 1, z: 0 });
    assertSameDirection(directionFromCubeFace({ face: EnumCubeFace.Down, s: 0, t: 0 }), {
      x: 0,
      y: -1,
      z: 0,
    });
  });

  for (const across of [-1, -0.5, 0, 0.5, 1]) {
    it(`нижний край up совпадает с верхним краем front и верхний край down — с нижним (s = ${String(across)})`, () => {
      assertSameDirection(
        directionFromCubeFace({ face: EnumCubeFace.Up, s: across, t: 1 }),
        directionFromCubeFace({ face: EnumCubeFace.Front, s: across, t: -1 }),
      );
      assertSameDirection(
        directionFromCubeFace({ face: EnumCubeFace.Down, s: across, t: -1 }),
        directionFromCubeFace({ face: EnumCubeFace.Front, s: across, t: 1 }),
      );
    });
  }

  it('правый край front совпадает с левым краем right', () => {
    assertSameDirection(
      directionFromCubeFace({ face: EnumCubeFace.Front, s: 1, t: 0.3 }),
      directionFromCubeFace({ face: EnumCubeFace.Right, s: -1, t: 0.3 }),
    );
  });

  for (const face of CUBE_FACES) {
    it(`направление → грань → направление без потерь для ${face}`, () => {
      for (const [across, down] of [
        [0.25, -0.75],
        [-0.9, 0.4],
        [0, 0],
      ]) {
        const facePoint = cubeFaceFromDirection(directionFromCubeFace({ face, s: across, t: down }));

        assert.equal(facePoint.face, face);
        assertClose(facePoint.s, across);
        assertClose(facePoint.t, down);
      }
    });
  }
});

describe('panorama-sources · Эквиректангулярная панорама одним файлом', () => {
  it('центральный столбец — yaw 0, края — yaw ±180, верх — зенит, низ — надир', () => {
    assertSameDirection(directionFromEquirect({ u: 0.5, v: 0.5 }), { x: 0, y: 0, z: 1 });
    assertSameDirection(directionFromEquirect({ u: 0, v: 0.5 }), { x: 0, y: 0, z: -1 });
    assertSameDirection(directionFromEquirect({ u: 1, v: 0.5 }), { x: 0, y: 0, z: -1 });
    assertSameDirection(directionFromEquirect({ u: 0.5, v: 0 }), { x: 0, y: 1, z: 0 });
    assertSameDirection(directionFromEquirect({ u: 0.5, v: 1 }), { x: 0, y: -1, z: 0 });
  });

  it('направление → (u, v) → направление без потерь', () => {
    for (const [column, row] of [
      [0.1, 0.2],
      [0.75, 0.6],
      [0.5, 0.95],
    ]) {
      const point = equirectFromDirection(directionFromEquirect({ u: column, v: row }));

      assertClose(point.u, column);
      assertClose(point.v, row);
    }
  });
});
