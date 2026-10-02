import { pixelsPerRadianForCube } from '../view/view-limits';
import { CUBE_FACES } from './tour-dictionaries';
import type { ICubeSource } from './tour-types';
import { FACE_PLACEHOLDER } from './url-template';

export const LEVEL_PLACEHOLDER = '{level}';
export const ROW_PLACEHOLDER = '{row}';
export const COLUMN_PLACEHOLDER = '{col}';

/**
 * Предел числа уровней: шейдер получает размеры и смещения уровней униформами-массивами фиксированной
 * длины.
 */
export const MAX_TILE_LEVELS = 10;

/**
 * Куб, у которого заданы и `tileSize`, и `levels`, — после `validateTour` других тайловых кубов не бывает.
 */
export type TTiledCubeSource = ICubeSource & { tileSize: number; levels: number[] };

export const isTiledCubeSource = (source: ICubeSource): source is TTiledCubeSource =>
  source.tileSize !== undefined && source.levels !== undefined;

/**
 * Уровень пирамиды: `index` — номер в шаблоне URL, `faceSize` — размер грани, `tilesPerSide` — тайлов
 * на сторону грани, `tileSize` — сторона тайла этого уровня (у уровня не больше `tileSize` источника —
 * весь уровень).
 */
export interface ITileLevel {
  index: number;
  faceSize: number;
  tilesPerSide: number;
  tileSize: number;
}

/**
 * Тайл пирамиды: уровень, номер грани в порядке `CUBE_FACES`, строка сверху и столбец слева.
 */
export interface ITileAddress {
  level: number;
  face: number;
  row: number;
  column: number;
}

/**
 * Уровни тайлового куба. Уровень не больше `tileSize` — один тайл размером с уровень, иначе грань
 * режется на квадраты `tileSize`: делимость проверяет `validateTour`, поэтому все тайлы полные.
 */
export const tileLevelsOf = (source: TTiledCubeSource): ITileLevel[] =>
  source.levels.map((faceSize, index) => ({
    index,
    faceSize,
    tilesPerSide: Math.max(1, faceSize / source.tileSize),
    tileSize: Math.min(faceSize, source.tileSize),
  }));

/**
 * URL тайла по шаблону источника. Имя грани берётся из `faceNames`, как у куба без уровней.
 */
export const tileUrlOf = (source: TTiledCubeSource, address: ITileAddress): string => {
  const face = CUBE_FACES[address.face];
  const faceName = face === undefined ? '' : (source.faceNames?.[face] ?? face);

  return source.url
    .replaceAll(LEVEL_PLACEHOLDER, String(address.level))
    .replaceAll(FACE_PLACEHOLDER, faceName)
    .replaceAll(ROW_PLACEHOLDER, String(address.row))
    .replaceAll(COLUMN_PLACEHOLDER, String(address.column));
};

/**
 * Плотность тайлового куба для `maxPixelZoom` — по самому подробному уровню из описания: приблизиться можно
 * сразу до его предела, а тайлы догрузятся по ходу приближения.
 */
export const tiledCubeDensity = (source: TTiledCubeSource): number =>
  pixelsPerRadianForCube(source.levels.at(-1) ?? source.tileSize);
