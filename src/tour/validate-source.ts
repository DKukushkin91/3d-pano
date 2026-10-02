import { COLUMN_PLACEHOLDER, LEVEL_PLACEHOLDER, MAX_TILE_LEVELS, ROW_PLACEHOLDER } from './tile-pyramid';
import { CUBE_FACES, EnumSourceType } from './tour-dictionaries';
import { FACE_PLACEHOLDER, isAllowedResourceUrl } from './url-template';
import {
  MUST_BE_NON_EMPTY_STRING,
  MUST_BE_OBJECT,
  type TReport,
  childPath,
  isNonEmptyString,
  isRecord,
  itemPath,
  listOf,
} from './validation-helpers';

const TILE_PLACEHOLDERS = [LEVEL_PLACEHOLDER, ROW_PLACEHOLDER, COLUMN_PLACEHOLDER] as const;

const validateUrl = (value: unknown, path: string, report: TReport): void => {
  if (!isNonEmptyString(value)) {
    report(path, MUST_BE_NON_EMPTY_STRING);

    return;
  }

  if (!isAllowedResourceUrl(value)) {
    report(path, 'uses a forbidden scheme: only http(s), blob, data:image and relative URLs are allowed');
  }
};

const validateFaceNames = (value: unknown, path: string, report: TReport): void => {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    report(path, 'must be an object that maps faces to names');

    return;
  }

  for (const [face, name] of Object.entries(value)) {
    if (!CUBE_FACES.some((cubeFace) => cubeFace === face)) {
      report(childPath(path, face), `is not a cube face: expected one of ${CUBE_FACES.join(', ')}`);
    } else if (!isNonEmptyString(name)) {
      report(childPath(path, face), MUST_BE_NON_EMPTY_STRING);
    }
  }
};

const isPositiveInteger = (value: unknown): value is number => Number.isInteger(value) && Number(value) > 0;

const validateUrlPlaceholders = (
  url: unknown,
  path: string,
  report: TReport,
  placeholders: readonly string[],
): void => {
  if (!isNonEmptyString(url)) {
    return;
  }

  for (const placeholder of placeholders) {
    if (!url.includes(placeholder)) {
      report(path, `must contain the ${placeholder} placeholder`);
    }
  }
};

const validateLevel = (
  level: unknown,
  previous: unknown,
  tileSize: unknown,
  path: string,
  report: TReport,
): void => {
  if (!isPositiveInteger(level)) {
    report(path, 'must be an integer > 0');

    return;
  }

  if (isPositiveInteger(previous) && level <= previous) {
    report(path, `must be greater than the previous level ${String(previous)}`);
  }

  if (isPositiveInteger(tileSize) && level > tileSize && level % tileSize !== 0) {
    report(path, `must be at most tileSize ${String(tileSize)} or a multiple of it`);
  }
};

const validateLevels = (levels: unknown, tileSize: unknown, path: string, report: TReport): void => {
  if (!Array.isArray(levels) || levels.length === 0 || levels.length > MAX_TILE_LEVELS) {
    report(path, `must be an array of 1 to ${String(MAX_TILE_LEVELS)} face sizes from small to large`);

    return;
  }

  levels.forEach((level: unknown, index) => {
    validateLevel(level, levels[index - 1], tileSize, itemPath(path, index), report);
  });
};

const validateTiles = (value: Record<string, unknown>, path: string, report: TReport): void => {
  const { tileSize, levels } = value;

  if (tileSize === undefined && levels === undefined) {
    return;
  }

  if (tileSize === undefined) {
    report(childPath(path, 'tileSize'), 'is required when levels are set');

    return;
  }

  if (levels === undefined) {
    report(childPath(path, 'levels'), 'are required when tileSize is set');

    return;
  }

  if (!isPositiveInteger(tileSize)) {
    report(childPath(path, 'tileSize'), 'must be an integer > 0');
  }

  validateLevels(levels, tileSize, childPath(path, 'levels'), report);
  validateUrlPlaceholders(value.url, childPath(path, 'url'), report, TILE_PLACEHOLDERS);
};

const validateCubeSource = (value: Record<string, unknown>, path: string, report: TReport): void => {
  const urlPath = childPath(path, 'url');

  validateUrl(value.url, urlPath, report);
  validateUrlPlaceholders(value.url, urlPath, report, [FACE_PLACEHOLDER]);
  validateFaceNames(value.faceNames, childPath(path, 'faceNames'), report);
  validateTiles(value, path, report);
};

/**
 * Источник и превью проверяются одинаково — превью тот же источник, только маленький, — кроме тайлового
 * куба: превью показывается целиком сразу, и тайлы ему ни к чему.
 */
export const validateSource = (value: unknown, path: string, report: TReport, isPreview = false): void => {
  if (!isRecord(value)) {
    report(path, MUST_BE_OBJECT);

    return;
  }

  if (value.type === EnumSourceType.Equirect) {
    validateUrl(value.url, childPath(path, 'url'), report);
  } else if (value.type === EnumSourceType.Cube) {
    validateCubeSource(value, path, report);
  } else {
    report(childPath(path, 'type'), `must be one of ${listOf(EnumSourceType)}`);
  }

  if (isPreview && (value.tileSize !== undefined || value.levels !== undefined)) {
    report(path, 'must not be a multiresolution cube: a preview has no tileSize and levels');
  }
};

/**
 * Один `tileSize` на тур: тайлы всех сцен делят один пул просмотрщика, а слои пула одного размера.
 */
export const validateTourTileSize = (scenes: readonly unknown[], report: TReport): void => {
  let tourTileSize: number | null = null;

  scenes.forEach((scene: unknown, index) => {
    const source = isRecord(scene) ? scene.source : undefined;
    const tileSize = isRecord(source) ? source.tileSize : undefined;

    if (!isPositiveInteger(tileSize)) {
      return;
    }

    tourTileSize ??= tileSize;

    if (tileSize !== tourTileSize) {
      report(
        childPath(childPath(itemPath('scenes', index), 'source'), 'tileSize'),
        `must equal the tileSize of the other multiresolution scenes (${String(tourTileSize)})`,
      );
    }
  });
};
