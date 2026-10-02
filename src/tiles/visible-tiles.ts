import { type ICameraBasis, cameraToWorld } from '../math/camera-basis';
import { cubeFaceFromDirection } from '../math/cube-faces';
import type { IHalfTangents } from '../math/field-of-view';
import { type INormalizedPoint, rectilinearRay } from '../math/rectilinear';
import { type ISceneSpace, sceneDirection } from '../math/scene-space';
import { type IVector3, subtractVectors, vectorLength } from '../math/vector3';
import type { ITileAddress, ITileLevel } from '../tour/tile-pyramid';
import { CUBE_FACES } from '../tour/tour-dictionaries';
import { type IBufferSize, type IFacePlanePoint, neededLevelAt, pixelAngleAt, tileAt } from './tile-math';

/**
 * Шаг сетки выборки в пикселях буфера. Тайл нужного уровня занимает на экране не меньше половины своей
 * стороны, поэтому при тайлах от 64 пикселей сетка его не пропустит; для меньших тайлов шаг уменьшается.
 */
export const SAMPLE_STEP_PIXELS = 32;

/**
 * Кадр, для которого ищутся тайлы: камера, размер буфера отрисовки и пространство сцены, если камера
 * сдвинута (во время шага).
 */
export interface ITileFrame {
  basis: ICameraBasis;
  halfTangents: IHalfTangents;
  buffer: IBufferSize;
  space?: ISceneSpace;
}

/**
 * Точка выборки: грань (номер в `CUBE_FACES`), место на грани, нужный уровень и угол от центра кадра в
 * радианах — по нему тайлы грузятся от центра к краям.
 */
export interface IFrameSample {
  face: number;
  point: IFacePlanePoint;
  neededLevel: number;
  distance: number;
}

/**
 * Видимый тайл с углом от центра кадра до ближайшей точки, попавшей в него.
 */
export interface IVisibleTile extends ITileAddress {
  distance: number;
}

export const tileKeyOf = ({ level, face, row, column }: ITileAddress): string =>
  `${String(level)}/${String(face)}/${String(row)}/${String(column)}`;

const gridPositions = (size: number, step: number): number[] => {
  const positions: number[] = [];

  for (let position = 0; position < size; position += step) {
    positions.push(position);
  }

  positions.push(size);

  return positions;
};

const directionOf = (frame: ITileFrame, cameraRay: IVector3): IVector3 => {
  const worldRay = cameraToWorld(frame.basis, cameraRay);

  return frame.space === undefined
    ? worldRay
    : sceneDirection(frame.space.model, frame.space.offset, worldRay);
};

const neighbourAngle = (frame: ITileFrame, from: IVector3, point: INormalizedPoint): number =>
  vectorLength(subtractVectors(directionOf(frame, rectilinearRay(point, frame.halfTangents)), from));

const pixelAngleOf = (frame: ITileFrame, point: INormalizedPoint): number => {
  if (frame.space === undefined) {
    return pixelAngleAt(point, frame.halfTangents, frame.buffer);
  }

  const here = directionOf(frame, rectilinearRay(point, frame.halfTangents));

  return Math.max(
    neighbourAngle(frame, here, { x: point.x + 2 / frame.buffer.width, y: point.y }),
    neighbourAngle(frame, here, { x: point.x, y: point.y + 2 / frame.buffer.height }),
  );
};

const sampleStepFor = (tileSize: number): number =>
  Math.max(1, Math.min(SAMPLE_STEP_PIXELS, Math.floor(tileSize / 2)));

/**
 * Выборка лучей по сетке буфера и по его краям. Для каждой точки — та же цепочка, что в шейдере: луч,
 * сдвиг камеры (`sceneDirection`, если камера не в центре), грань, размер пикселя по направлениям соседних
 * пикселей (как `dFdx`/`dFdy`) и нужный уровень. Пустой буфер даёт пустую выборку.
 */
export const sampleTileFrame = (
  frame: ITileFrame,
  levels: readonly ITileLevel[],
  tileSize: number,
): IFrameSample[] => {
  const { buffer, halfTangents } = frame;
  const samples: IFrameSample[] = [];

  if (buffer.width <= 0 || buffer.height <= 0) {
    return samples;
  }

  const step = sampleStepFor(tileSize);
  const faceSizes = levels.map((level) => level.faceSize);
  const rows = gridPositions(buffer.height, step);

  for (const column of gridPositions(buffer.width, step)) {
    for (const row of rows) {
      const point = { x: (2 * column) / buffer.width - 1, y: 1 - (2 * row) / buffer.height };
      const ray = rectilinearRay(point, halfTangents);
      const facePoint = cubeFaceFromDirection(directionOf(frame, ray));

      samples.push({
        face: CUBE_FACES.indexOf(facePoint.face),
        point: { s: facePoint.s, t: facePoint.t },
        neededLevel: neededLevelAt(pixelAngleOf(frame, point), facePoint, faceSizes),
        distance: Math.acos(Math.min(1, ray.z)),
      });
    }
  }

  return samples;
};

const collectTile = (tiles: Map<string, IVisibleTile>, sample: IFrameSample, level: ITileLevel): void => {
  const { row, column } = tileAt(sample.point, level.tilesPerSide);
  const address = { level: level.index, face: sample.face, row, column };
  const key = tileKeyOf(address);
  const known = tiles.get(key);

  if (known === undefined || sample.distance < known.distance) {
    tiles.set(key, { ...address, distance: sample.distance });
  }
};

const byLevelThenDistance = (first: IVisibleTile, second: IVisibleTile): number =>
  first.level - second.level || first.distance - second.distance;

const sortedTiles = (tiles: Map<string, IVisibleTile>): IVisibleTile[] => {
  const list = [...tiles.values()];

  list.sort(byLevelThenDistance);

  return list;
};

/**
 * Тайлы, которые нужны кадру до готовности: только нужный уровень в каждой точке, без промежуточных —
 * при смене сцены их всё равно не видно. Подложка (уровень 0) сюда не входит, она грузится целиком.
 */
export const neededTilesOf = (
  samples: readonly IFrameSample[],
  levels: readonly ITileLevel[],
): IVisibleTile[] => {
  const tiles = new Map<string, IVisibleTile>();

  for (const sample of samples) {
    const level = levels[sample.neededLevel];

    if (sample.neededLevel > 0 && level !== undefined) {
      collectTile(tiles, sample, level);
    }
  }

  return sortedTiles(tiles);
};

const coveredLevel = (
  sample: IFrameSample,
  levels: readonly ITileLevel[],
  isCovered: (address: ITileAddress) => boolean,
): number => {
  for (let index = sample.neededLevel; index >= 1; index -= 1) {
    const level = levels[index];

    if (level !== undefined) {
      const { row, column } = tileAt(sample.point, level.tilesPerSide);

      if (isCovered({ level: index, face: sample.face, row, column })) {
        return index;
      }
    }
  }

  return 0;
};

/**
 * Тайлы кадра после готовности: в каждой точке уровни от самого подробного, уже лежащего в пуле
 * (`isCovered`), до нужного — картинка становится чётче постепенно, а грубые уровни там, где есть подробный,
 * не просятся. Лежащий тайл остаётся в списке: кадр его рисует, и пул не должен его вытеснить. Порядок — по
 * уровню, затем от центра кадра.
 */
export const progressiveTilesOf = (
  samples: readonly IFrameSample[],
  levels: readonly ITileLevel[],
  isCovered: (address: ITileAddress) => boolean = () => false,
): IVisibleTile[] => {
  const tiles = new Map<string, IVisibleTile>();

  for (const sample of samples) {
    for (
      let index = Math.max(1, coveredLevel(sample, levels, isCovered));
      index <= sample.neededLevel;
      index += 1
    ) {
      const level = levels[index];

      if (level !== undefined) {
        collectTile(tiles, sample, level);
      }
    }
  }

  return sortedTiles(tiles);
};

/**
 * Все тайлы подложки — самого мелкого уровня — по граням, строкам и столбцам.
 */
export const baseTilesOf = (baseLevel: ITileLevel): ITileAddress[] =>
  CUBE_FACES.flatMap((_face, face) =>
    Array.from({ length: baseLevel.tilesPerSide ** 2 }, (_unused, index) => ({
      level: baseLevel.index,
      face,
      row: Math.floor(index / baseLevel.tilesPerSide),
      column: index % baseLevel.tilesPerSide,
    })),
  );
