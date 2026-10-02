import type { ITourIssue } from './tour-types';
import { validateHotspots } from './validate-hotspots';
import { validateDefaultCameraHeight, validateScenePlace } from './validate-place';
import { validateSource, validateTourTileSize } from './validate-source';
import { validateLimits, validateView } from './validate-view';
import {
  MUST_BE_NON_EMPTY_STRING,
  MUST_BE_OBJECT,
  type TReport,
  childPath,
  isNonEmptyString,
  isRecord,
  itemPath,
} from './validation-helpers';

const validateSceneId = (value: unknown, path: string, report: TReport, seenIds: Set<string>): void => {
  if (!isNonEmptyString(value)) {
    report(path, MUST_BE_NON_EMPTY_STRING);
  } else if (seenIds.has(value)) {
    report(path, `duplicates another scene id "${value}"`);
  } else {
    seenIds.add(value);
  }
};

const validateScene = (value: unknown, path: string, report: TReport, seenIds: Set<string>): void => {
  if (!isRecord(value)) {
    report(path, MUST_BE_OBJECT);

    return;
  }

  validateSceneId(value.id, childPath(path, 'id'), report, seenIds);

  if (value.title !== undefined && typeof value.title !== 'string') {
    report(childPath(path, 'title'), 'must be a string');
  }

  validateSource(value.source, childPath(path, 'source'), report);

  if (value.preview !== undefined) {
    validateSource(value.preview, childPath(path, 'preview'), report, true);
  }

  validateView(value.view, childPath(path, 'view'), report);
  validateLimits(value.limits, childPath(path, 'limits'), report);
  validateScenePlace(value, path, report);
};

const validateScenes = (value: unknown, report: TReport): Set<string> => {
  const seenIds = new Set<string>();

  if (!Array.isArray(value) || value.length === 0) {
    report('scenes', 'must be a non-empty array of scenes');

    return seenIds;
  }

  value.forEach((scene: unknown, index) => {
    validateScene(scene, itemPath('scenes', index), report, seenIds);
  });
  validateTourTileSize(value, report);

  return seenIds;
};

const validateSceneHotspots = (value: unknown, report: TReport, sceneIds: ReadonlySet<string>): void => {
  if (!Array.isArray(value)) {
    return;
  }

  value.forEach((scene: unknown, index) => {
    if (isRecord(scene)) {
      validateHotspots(scene.hotspots, childPath(itemPath('scenes', index), 'hotspots'), report, sceneIds);
    }
  });
};

const validateDefaults = (value: unknown, report: TReport): void => {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    report('defaults', MUST_BE_OBJECT);

    return;
  }

  validateView(value.view, 'defaults.view', report);
  validateLimits(value.limits, 'defaults.limits', report);
  validateDefaultCameraHeight(value.cameraHeight, 'defaults.cameraHeight', report);
};

/**
 * Проверяет тур как непроверенные данные (`unknown`): тур обычно приходит ответом сервера, и TypeScript
 * хоста за его содержимое не ручается. Возвращает все проблемы сразу, чтобы автор тура исправил их за один
 * проход; пустой массив — тур корректен. Хотспоты проверяются вторым проходом: переход может вести в
 * сцену, описанную ниже.
 */
export const validateTour = (value: unknown): ITourIssue[] => {
  const issues: ITourIssue[] = [];
  const report: TReport = (path, message) => {
    issues.push({ path, message });
  };

  if (!isRecord(value)) {
    report('', 'tour must be an object');

    return issues;
  }

  const sceneIds = validateScenes(value.scenes, report);
  const { startScene } = value;

  validateSceneHotspots(value.scenes, report, sceneIds);

  if (startScene !== undefined && (typeof startScene !== 'string' || !sceneIds.has(startScene))) {
    report('startScene', 'must be the id of one of the scenes');
  }

  validateDefaults(value.defaults, report);

  return issues;
};
