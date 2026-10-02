import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  cameraBasisFromAngles,
  cameraToWorld,
  cubeFaceFromDirection,
  CUBE_FACES,
  halfTangentsFromFov,
  neededLevelAt,
  neededTilesOf,
  pixelAngleAt,
  progressiveTilesOf,
  rectilinearRay,
  sampleTileFrame,
  baseTilesOf,
  texelAngleAt,
  tileAt,
  tileKeyOf,
  tileLevelsOf,
  tileTableIndex,
  tileTableOffsets,
} from '../dist/internal.js';

const TILE_SIZE = 512;
const FACE_SIZES = [512, 1024, 2048, 4096];
const LEVELS = tileLevelsOf({
  type: 'cube',
  url: '{level}/{face}/{row}_{col}',
  tileSize: TILE_SIZE,
  levels: FACE_SIZES,
});
const SQUARE_BUFFER = { width: 1000, height: 1000 };
const FACE_CENTER = { s: 0, t: 0 };
const FRAME_CENTER = { x: 0, y: 0 };
const BACK = CUBE_FACES.indexOf('back');
const DENSE_STEP_PIXELS = 4;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

const frameOf = ({ yaw = 0, pitch = 0, fov = 90, buffer = SQUARE_BUFFER } = {}) => ({
  basis: cameraBasisFromAngles(toRadians(yaw), toRadians(pitch), 0),
  halfTangents: halfTangentsFromFov(toRadians(fov), 'max', buffer.width / buffer.height),
  buffer,
});

const centerLevel = (frame) =>
  neededLevelAt(pixelAngleAt(FRAME_CENTER, frame.halfTangents, frame.buffer), FACE_CENTER, FACE_SIZES);

const samplesOf = (frame) => sampleTileFrame(frame, LEVELS, TILE_SIZE);

const keysOf = (tiles) => new Set(tiles.map(tileKeyOf));

const denseTileKey = (frame, facePoint, level) => {
  const { row, column } = tileAt(facePoint, LEVELS[level].tilesPerSide);

  return tileKeyOf({ level, face: CUBE_FACES.indexOf(facePoint.face), row, column });
};

/**
 * Пиксель кадра: `null`, если ему хватает подложки; иначе — есть ли в наборе тайл нужного уровня и тайл
 * уровнем грубее.
 */
const pixelCoverage = (frame, keys, column, row) => {
  const point = { x: (2 * column) / frame.buffer.width - 1, y: 1 - (2 * row) / frame.buffer.height };
  const ray = rectilinearRay(point, frame.halfTangents);
  const facePoint = cubeFaceFromDirection(cameraToWorld(frame.basis, ray));
  const level = neededLevelAt(pixelAngleAt(point, frame.halfTangents, frame.buffer), facePoint, FACE_SIZES);

  if (level === 0) {
    return null;
  }

  return {
    isCovered: keys.has(denseTileKey(frame, facePoint, level)),
    hasCoarser: level === 1 || keys.has(denseTileKey(frame, facePoint, level - 1)),
  };
};

/**
 * Проходит кадр с шагом 4 пикселя и собирает пиксели, тайла нужного уровня которых нет в наборе.
 */
const missingDenseTiles = (frame, keys) => {
  const coverage = [];

  for (let column = 0; column <= frame.buffer.width; column += DENSE_STEP_PIXELS) {
    for (let row = 0; row <= frame.buffer.height; row += DENSE_STEP_PIXELS) {
      coverage.push(pixelCoverage(frame, keys, column, row));
    }
  }

  const checked = coverage.filter((pixel) => pixel !== null);

  return { missing: checked.filter((pixel) => !pixel.isCovered), checked: checked.length };
};

describe('multiresolution · Нужный уровень', () => {
  it('размер пикселя в центре кадра FOV 90 на 1000 пикселей — 2/1000 радиана', () => {
    const angle = pixelAngleAt(FRAME_CENTER, frameOf().halfTangents, SQUARE_BUFFER);

    assert.ok(Math.abs(angle - 0.002) < 1e-5);
  });

  it('тексель уменьшается к краю грани как 1 / (1 + s² + t²)', () => {
    assert.equal(texelAngleAt(1024, FACE_CENTER), 2 / 1024);
    assert.equal(texelAngleAt(1024, { s: 1, t: 1 }), 2 / 1024 / 3);
  });

  it('нужный уровень — самый мелкий с текселем не больше пикселя; у края грани он мельче, чем в центре', () => {
    assert.equal(neededLevelAt(0.002, FACE_CENTER, FACE_SIZES), 1);
    assert.equal(neededLevelAt(0.002, { s: 1, t: 0 }, FACE_SIZES), 0);
  });

  it('за самым подробным уровнем остаётся самый подробный', () => {
    assert.equal(neededLevelAt(1e-6, FACE_CENTER, FACE_SIZES), FACE_SIZES.length - 1);
  });

  it('Приближение: FOV 90 → 30 делает нужный уровень в центре подробнее', () => {
    assert.equal(centerLevel(frameOf({ fov: 90 })), 1);
    assert.equal(centerLevel(frameOf({ fov: 30 })), 3);
  });

  it('Окно стало больше: буфер 1000 → 2000 делает нужный уровень подробнее', () => {
    assert.equal(centerLevel(frameOf()), 1);
    assert.equal(centerLevel(frameOf({ buffer: { width: 2000, height: 2000 } })), 2);
  });
});

describe('multiresolution · Тайл и таблица сопоставления', () => {
  it('край грани относится к крайнему тайлу, точка внутри тайла — 0…1', () => {
    assert.deepEqual(tileAt({ s: -1, t: -1 }, 4), { row: 0, column: 0, pointInTile: { x: 0, y: 0 } });
    assert.deepEqual(tileAt({ s: 1, t: 1 }, 4), { row: 3, column: 3, pointInTile: { x: 1, y: 1 } });
    assert.deepEqual(tileAt({ s: 0.25, t: -0.25 }, 2), {
      row: 0,
      column: 1,
      pointInTile: { x: 0.25, y: 0.75 },
    });
  });

  it('смещения уровней — по n² записей на каждую из шести граней', () => {
    assert.deepEqual(tileTableOffsets([1, 2, 4, 8]), [0, 6, 30, 126]);
  });

  it('номер записи — offset + face · n² + row · n + col', () => {
    assert.equal(tileTableIndex(30, 4, { face: 2, row: 1, column: 3 }), 30 + 32 + 4 + 3);
  });
});

describe('multiresolution · Видимые тайлы и порядок загрузки', () => {
  it('Задняя грань не грузится: взгляд вперёд с FOV 90', () => {
    const samples = samplesOf(frameOf({ fov: 90 }));

    assert.ok(samples.length > 0);
    assert.equal(progressiveTilesOf(samples, LEVELS).filter((tile) => tile.face === BACK).length, 0);
  });

  it('Готовность без промежуточных уровней: нужен третий уровень — только тайлы третьего, от центра', () => {
    const tiles = neededTilesOf(samplesOf(frameOf({ fov: 30 })), LEVELS);

    assert.ok(tiles.length > 0);
    assert.ok(tiles.every((tile) => tile.level === 3));
    assert.deepEqual(
      tiles.map((tile) => tile.distance),
      tiles.map((tile) => tile.distance).toSorted((first, second) => first - second),
    );
  });

  it('после готовности — все уровни от первого до нужного, раньше более грубые', () => {
    const tiles = progressiveTilesOf(samplesOf(frameOf({ fov: 30 })), LEVELS);
    const levels = tiles.map((tile) => tile.level);

    assert.deepEqual([...new Set(levels)], [1, 2, 3]);
  });

  it('там, где нужный уровень уже лежит в пуле, грубые уровни не просятся, а лежащий тайл остаётся в кадре', () => {
    const samples = samplesOf(frameOf({ fov: 30 }));
    const tiles = progressiveTilesOf(samples, LEVELS, (address) => address.level === 3);

    assert.ok(tiles.length > 0);
    assert.ok(tiles.every((tile) => tile.level === 3));
  });

  it('пустой буфер — пустая выборка', () => {
    assert.deepEqual(samplesOf(frameOf({ buffer: { width: 0, height: 0 } })), []);
  });

  it('подложка — все тайлы самого мелкого уровня по граням', () => {
    const base = baseTilesOf({ index: 0, faceSize: 1024, tilesPerSide: 2, tileSize: 512 });

    assert.equal(base.length, 24);
    assert.deepEqual(base[5], { level: 0, face: 1, row: 0, column: 1 });
  });

  for (const view of [
    { yaw: 0, pitch: 0, fov: 90 },
    { yaw: 45, pitch: 0, fov: 60 },
    { yaw: 30, pitch: 20, fov: 50 },
    { yaw: -120, pitch: -70, fov: 75 },
    { yaw: 45, pitch: 35, fov: 90 },
  ]) {
    it(`сетка 32 пикселя находит тайлы нужного уровня: yaw ${String(view.yaw)}, pitch ${String(view.pitch)}, FOV ${String(view.fov)}`, () => {
      const frame = frameOf(view);
      const keys = keysOf(progressiveTilesOf(samplesOf(frame), LEVELS));
      const { missing, checked } = missingDenseTiles(frame, keys);

      assert.ok(missing.length / checked < 0.005, `${String(missing.length)} of ${String(checked)}`);
      assert.ok(missing.every((pixel) => pixel.hasCoarser));
    });
  }

  it('тайлы нужного уровня покрывают кадр, где уровень один на весь кадр', () => {
    const frame = frameOf({ fov: 30 });
    const keys = keysOf(neededTilesOf(samplesOf(frame), LEVELS));

    assert.deepEqual(missingDenseTiles(frame, keys).missing, []);
  });
});
