import { CUBE_FACES, EnumSourceType } from './tour-dictionaries';
import { FACE_PLACEHOLDER, isAllowedResourceUrl } from './url-template';
import {
  MUST_BE_NON_EMPTY_STRING,
  MUST_BE_OBJECT,
  type TReport,
  childPath,
  isNonEmptyString,
  isRecord,
  listOf,
} from './validation-helpers';

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

const validateCubeSource = (value: Record<string, unknown>, path: string, report: TReport): void => {
  const urlPath = childPath(path, 'url');

  validateUrl(value.url, urlPath, report);

  if (isNonEmptyString(value.url) && !value.url.includes(FACE_PLACEHOLDER)) {
    report(urlPath, `must contain the ${FACE_PLACEHOLDER} placeholder`);
  }

  validateFaceNames(value.faceNames, childPath(path, 'faceNames'), report);
};

/**
 * Источник и превью проверяются одинаково: превью — тот же источник, только маленький.
 */
export const validateSource = (value: unknown, path: string, report: TReport): void => {
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
};
