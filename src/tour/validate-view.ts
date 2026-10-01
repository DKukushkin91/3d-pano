import { EnumBoundsMode, EnumFovMode } from './tour-dictionaries';
import {
  type INumberRule,
  MUST_BE_OBJECT,
  type TReport,
  childPath,
  isDictionaryValue,
  isRangeWithin,
  isRecord,
  listOf,
  validateOptionalNumber,
} from './validation-helpers';

const MAX_FOV_DEGREES = 180;
const MAX_PITCH_DEGREES = 90;
const FULL_TURN_DEGREES = 360;

const ANY_ANGLE: INumberRule = { isValid: () => true, requirement: 'must be a finite number of degrees' };

const PITCH_ANGLE: INumberRule = {
  isValid: (pitch) => Math.abs(pitch) <= MAX_PITCH_DEGREES,
  requirement: `must be a number of degrees from -${String(MAX_PITCH_DEGREES)} to ${String(MAX_PITCH_DEGREES)}`,
};

const FOV_ANGLE: INumberRule = {
  isValid: (fov) => fov > 0 && fov < MAX_FOV_DEGREES,
  requirement: `must be a number of degrees greater than 0 and less than ${String(MAX_FOV_DEGREES)}`,
};

const POSITIVE_NUMBER: INumberRule = {
  isValid: (value) => value > 0,
  requirement: 'must be a number greater than 0',
};

/**
 * Начальный вид из `scene.view` или `tour.defaults.view`.
 */
export const validateView = (value: unknown, path: string, report: TReport): void => {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    report(path, MUST_BE_OBJECT);

    return;
  }

  validateOptionalNumber(value.yaw, childPath(path, 'yaw'), report, ANY_ANGLE);
  validateOptionalNumber(value.roll, childPath(path, 'roll'), report, ANY_ANGLE);
  validateOptionalNumber(value.pitch, childPath(path, 'pitch'), report, PITCH_ANGLE);
  validateOptionalNumber(value.fov, childPath(path, 'fov'), report, FOV_ANGLE);

  if (value.fovMode !== undefined && !isDictionaryValue(EnumFovMode, value.fovMode)) {
    report(childPath(path, 'fovMode'), `must be one of ${listOf(EnumFovMode)}`);
  }
};

const isYawRange = (value: unknown): boolean =>
  isRangeWithin(value, { lowest: -Infinity, highest: Infinity, isStrict: true }) &&
  value[1] - value[0] <= FULL_TURN_DEGREES;

const isPitchRange = (value: unknown): boolean =>
  isRangeWithin(value, { lowest: -MAX_PITCH_DEGREES, highest: MAX_PITCH_DEGREES, isStrict: true });

const isFovRange = (value: unknown): boolean =>
  isRangeWithin(value, {
    lowest: Number.MIN_VALUE,
    highest: MAX_FOV_DEGREES - Number.EPSILON,
    isStrict: false,
  });

const validateBounds = (value: unknown, path: string, report: TReport): void => {
  if (value === undefined || isDictionaryValue(EnumBoundsMode, value)) {
    return;
  }

  if (!isRecord(value)) {
    report(path, `must be one of ${listOf(EnumBoundsMode)} or an object with yaw and pitch ranges`);

    return;
  }

  if (value.yaw !== undefined && !isYawRange(value.yaw)) {
    report(
      childPath(path, 'yaw'),
      `must be [min, max] degrees, min < max, at most ${String(FULL_TURN_DEGREES)} apart`,
    );
  }

  if (value.pitch !== undefined && !isPitchRange(value.pitch)) {
    report(
      childPath(path, 'pitch'),
      `must be [min, max] degrees, min < max, within ±${String(MAX_PITCH_DEGREES)}`,
    );
  }
};

/**
 * Ограничения из `scene.limits` или `tour.defaults.limits`.
 */
export const validateLimits = (value: unknown, path: string, report: TReport): void => {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    report(path, MUST_BE_OBJECT);

    return;
  }

  if (value.fov !== undefined && !isFovRange(value.fov)) {
    report(
      childPath(path, 'fov'),
      `must be [min, max] degrees with 0 < min <= max < ${String(MAX_FOV_DEGREES)}`,
    );
  }

  validateOptionalNumber(value.maxPixelZoom, childPath(path, 'maxPixelZoom'), report, POSITIVE_NUMBER);
  validateBounds(value.bounds, childPath(path, 'bounds'), report);
};
