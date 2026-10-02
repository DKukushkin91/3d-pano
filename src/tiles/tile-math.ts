import type { IHalfTangents } from '../math/field-of-view';
import { type INormalizedPoint, rectilinearRay } from '../math/rectilinear';
import { type IVector3, createVector3, vectorLength } from '../math/vector3';
import { CUBE_FACES } from '../tour/tour-dictionaries';

/**
 * Размер буфера отрисовки в физических пикселях — уровень выбирается по ним, а не по CSS-пикселям.
 */
export interface IBufferSize {
  width: number;
  height: number;
}

/**
 * Точка на грани куба: `s` вправо, `t` вниз по изображению грани, обе −1…1 — как в `cubeFaceFromDirection`.
 */
export interface IFacePlanePoint {
  s: number;
  t: number;
}

const differenceLength = (first: IVector3, second: IVector3): number =>
  vectorLength(createVector3(first.x - second.x, first.y - second.y, first.z - second.z));

/**
 * Угловой размер пикселя буфера в точке кадра: расстояние до лучей соседних пикселей справа и сверху,
 * большее из двух. Шейдер считает то же самое как `max(length(dFdx(direction)), length(dFdy(direction)))`;
 * поворот камеры углов не меняет, поэтому лучи берутся в осях камеры.
 */
export const pixelAngleAt = (
  point: INormalizedPoint,
  halfTangents: IHalfTangents,
  buffer: IBufferSize,
): number => {
  const ray = rectilinearRay(point, halfTangents);
  const rightRay = rectilinearRay({ x: point.x + 2 / buffer.width, y: point.y }, halfTangents);
  const upRay = rectilinearRay({ x: point.x, y: point.y + 2 / buffer.height }, halfTangents);

  return Math.max(differenceLength(ray, rightRay), differenceLength(ray, upRay));
};

/**
 * Угловой размер текселя грани размером `faceSize` в точке грани `(s, t)`: к краям грани тексель
 * видится меньше как `1 / (1 + s² + t²)`. Та же формула стоит в кубическом шейдере.
 */
export const texelAngleAt = (faceSize: number, point: IFacePlanePoint): number =>
  2 / faceSize / (1 + point.s * point.s + point.t * point.t);

/**
 * Нужный уровень — самый мелкий, у которого тексель не больше пикселя, а если таких нет — самый
 * подробный. Рисовать подробнее нужного нельзя: без MIP уменьшенный тексель даёт рябь.
 */
export const neededLevelAt = (
  pixelAngle: number,
  point: IFacePlanePoint,
  faceSizes: readonly number[],
): number => {
  const level = faceSizes.findIndex((faceSize) => texelAngleAt(faceSize, point) <= pixelAngle);

  return level === -1 ? faceSizes.length - 1 : level;
};

/**
 * Строка и столбец тайла, в который попадает точка грани, и точка внутри тайла (0…1). Координаты грани
 * `(s, t) / 2 + 0.5` переводятся в сетку `tilesPerSide`, край грани относится к последнему тайлу — как в
 * шейдере.
 */
export const tileAt = (
  point: IFacePlanePoint,
  tilesPerSide: number,
): { row: number; column: number; pointInTile: INormalizedPoint } => {
  const scaledX = ((point.s + 1) / 2) * tilesPerSide;
  const scaledY = ((point.t + 1) / 2) * tilesPerSide;
  const column = Math.min(Math.max(Math.floor(scaledX), 0), tilesPerSide - 1);
  const row = Math.min(Math.max(Math.floor(scaledY), 0), tilesPerSide - 1);

  return { row, column, pointInTile: { x: scaledX - column, y: scaledY - row } };
};

/**
 * Смещения уровней в таблице сопоставления: записи уровня `l` идут подряд, по `n_l²` на каждую из шести граней, грань за
 * гранью и строка за строкой. Подложка (уровень 0) тоже занимает место, хотя рисуется из своей текстуры, —
 * так номер записи считается одной формулой для любого уровня.
 */
export const tileTableOffsets = (tilesPerSide: readonly number[]): number[] => {
  const offsets: number[] = [];
  let offset = 0;

  for (const count of tilesPerSide) {
    offsets.push(offset);
    offset += CUBE_FACES.length * count * count;
  }

  return offsets;
};

/**
 * Номер записи тайла в таблице сопоставления — `offset_l + face · n_l² + row · n_l + col`, как в шейдере.
 */
export const tileTableIndex = (
  levelOffset: number,
  tilesPerSide: number,
  address: { face: number; row: number; column: number },
): number =>
  levelOffset + address.face * tilesPerSide * tilesPerSide + address.row * tilesPerSide + address.column;
