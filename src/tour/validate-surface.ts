import {
  MUST_BE_NON_EMPTY_STRING,
  MUST_BE_OBJECT,
  type TReport,
  childPath,
  isNonEmptyString,
  isRecord,
  validateOptionalNumber,
} from './validation-helpers';

const SOURCE_KEYS = ['image', 'video'] as const;

const POSITIVE_WIDTH = {
  isValid: (width: number) => width > 0,
  requirement: 'must be a finite number > 0 — the width in world units',
};

/**
 * Поверхность хотспота: ровно один источник (`image` или `video`) — непустой URL, необязательная
 * положительная `width`. Поверхность лежит в плоскости хотспота, поэтому без `plane` это ошибка данных:
 * тур статичен, и автор увидит её сразу, а не по пустому месту на экране.
 */
export const validateSurface = (value: unknown, path: string, report: TReport, hasPlane: boolean): void => {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    report(path, MUST_BE_OBJECT);

    return;
  }

  const sourceKeys = SOURCE_KEYS.filter((key) => value[key] !== undefined);

  if (sourceKeys.length !== 1) {
    report(path, 'must have exactly one of "image" or "video"');
  }

  for (const key of sourceKeys) {
    if (!isNonEmptyString(value[key])) {
      report(childPath(path, key), `${MUST_BE_NON_EMPTY_STRING} URL`);
    }
  }

  validateOptionalNumber(value.width, childPath(path, 'width'), report, POSITIVE_WIDTH);

  if (!hasPlane) {
    report(path, 'requires "plane": the surface lies in the plane of the hotspot');
  }
};
