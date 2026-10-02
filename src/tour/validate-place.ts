import {
  type INumberRule,
  MUST_BE_OBJECT,
  type TReport,
  childPath,
  isFiniteNumber,
  isRecord,
  validateOptionalNumber,
} from './validation-helpers';

const ANY_ANGLE: INumberRule = { isValid: () => true, requirement: 'must be a finite number of degrees' };

const CAMERA_HEIGHT: INumberRule = {
  isValid: (height) => height > 0,
  requirement: 'must be a number greater than 0 — the height of the camera above the floor',
};

const validatePosition = (value: unknown, path: string, report: TReport): void => {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value) || ![value.x, value.y, value.z].every(isFiniteNumber)) {
    report(path, `${MUST_BE_OBJECT} with finite x, y and z`);
  }
};

/**
 * Место сцены в мире: `position`, `heading` и `cameraHeight`. Проверяется так же строго, как остальной
 * тур, — по этим данным переход «шаг» считает путь камеры.
 */
export const validateScenePlace = (scene: Record<string, unknown>, path: string, report: TReport): void => {
  validatePosition(scene.position, childPath(path, 'position'), report);
  validateOptionalNumber(scene.heading, childPath(path, 'heading'), report, ANY_ANGLE);
  validateOptionalNumber(scene.cameraHeight, childPath(path, 'cameraHeight'), report, CAMERA_HEIGHT);
};

/**
 * `cameraHeight` в `tour.defaults` — по тем же правилам, что в сцене.
 */
export const validateDefaultCameraHeight = (value: unknown, path: string, report: TReport): void => {
  validateOptionalNumber(value, path, report, CAMERA_HEIGHT);
};
