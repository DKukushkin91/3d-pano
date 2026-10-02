import { EnumHotspotAnchor } from '../hotspots/hotspot-dictionaries';
import { resolveShowSceneOptions } from '../navigation/show-scene-options';
import {
  MUST_BE_NON_EMPTY_STRING,
  MUST_BE_OBJECT,
  type TReport,
  childPath,
  isDictionaryValue,
  isFiniteNumber,
  isNonEmptyString,
  isRecord,
  itemPath,
  listOf,
} from './validation-helpers';

const ERROR_PREFIX = /^3d-pano: /;

const isSpherePoint = (value: Record<string, unknown>): boolean => 'yaw' in value || 'pitch' in value;

const isZeroDirection = (value: Record<string, unknown>): boolean =>
  value.x === 0 && value.y === 0 && value.z === 0;

const positionProblem = (value: unknown): string | null => {
  if (!isRecord(value)) {
    return 'must be a { yaw, pitch } point or an { x, y, z } direction';
  }

  if (isSpherePoint(value)) {
    return isFiniteNumber(value.yaw) && isFiniteNumber(value.pitch) ? null : 'must have finite yaw and pitch';
  }

  if (![value.x, value.y, value.z].every(isFiniteNumber)) {
    return 'must have finite x, y and z';
  }

  return isZeroDirection(value) ? 'must not be a zero direction' : null;
};

const validateId = (value: unknown, path: string, report: TReport, seenIds: Set<string>): void => {
  if (!isNonEmptyString(value)) {
    report(path, MUST_BE_NON_EMPTY_STRING);
  } else if (seenIds.has(value)) {
    report(path, `duplicates another hotspot id "${value}" in this scene`);
  } else {
    seenIds.add(value);
  }
};

const transitionProblem = (target: Record<string, unknown>): string | null => {
  try {
    resolveShowSceneOptions(target);

    return null;
  } catch (error) {
    return error instanceof Error ? error.message.replace(ERROR_PREFIX, '') : String(error);
  }
};

const validateTarget = (
  value: unknown,
  path: string,
  report: TReport,
  sceneIds: ReadonlySet<string>,
): void => {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    report(path, MUST_BE_OBJECT);

    return;
  }

  if (typeof value.scene !== 'string' || !sceneIds.has(value.scene)) {
    report(childPath(path, 'scene'), 'must be the id of one of the scenes');
  }

  if (value.keepMotion !== undefined && typeof value.keepMotion !== 'boolean') {
    report(childPath(path, 'keepMotion'), 'must be a boolean');
  }

  const problem = transitionProblem(value);

  if (problem !== null) {
    report(path, problem);
  }
};

const validateFacing = (value: unknown, path: string, report: TReport): void => {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value) || !isFiniteNumber(value.yaw) || !isFiniteNumber(value.pitch)) {
    report(path, 'must be a { yaw, pitch } direction with finite angles');
  }
};

const validatePlane = (value: unknown, path: string, report: TReport): void => {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    report(path, MUST_BE_OBJECT);

    return;
  }

  if (!isFiniteNumber(value.width) || value.width <= 0) {
    report(childPath(path, 'width'), 'must be a finite number > 0');
  }

  validateFacing(value.facing, childPath(path, 'facing'), report);

  if (value.spin !== undefined && !isFiniteNumber(value.spin)) {
    report(childPath(path, 'spin'), 'must be a finite number of degrees');
  }
};

const validateHotspot = (
  value: unknown,
  path: string,
  report: TReport,
  context: { seenIds: Set<string>; sceneIds: ReadonlySet<string> },
): void => {
  if (!isRecord(value)) {
    report(path, MUST_BE_OBJECT);

    return;
  }

  validateId(value.id, childPath(path, 'id'), report, context.seenIds);

  const problem = positionProblem(value.position);

  if (problem !== null) {
    report(childPath(path, 'position'), problem);
  }

  if (value.title !== undefined && typeof value.title !== 'string') {
    report(childPath(path, 'title'), 'must be a string');
  }

  if (value.anchor !== undefined && !isDictionaryValue(EnumHotspotAnchor, value.anchor)) {
    report(childPath(path, 'anchor'), `must be one of ${listOf(EnumHotspotAnchor)}`);
  }

  validateTarget(value.target, childPath(path, 'target'), report, context.sceneIds);
  validatePlane(value.plane, childPath(path, 'plane'), report);
};

/**
 * Хотспоты сцены проверяются так же строго, как остальной тур: любая проблема делает тур невалидным.
 * `sceneIds` — все сцены тура, потому что переход может вести в сцену, описанную ниже. Опции перехода
 * проверяет тот же разбор, что и у `showScene`, — правило одно на оба пути. `data` не проверяется: это
 * данные хоста.
 */
export const validateHotspots = (
  value: unknown,
  path: string,
  report: TReport,
  sceneIds: ReadonlySet<string>,
): void => {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    report(path, 'must be an array of hotspots');

    return;
  }

  const context = { seenIds: new Set<string>(), sceneIds };

  value.forEach((hotspot: unknown, index) => {
    validateHotspot(hotspot, itemPath(path, index), report, context);
  });
};
