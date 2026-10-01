import { PanoLoadError, createPanoError } from '../resources/load-errors';
import { EnumErrorCode } from '../state/viewer-dictionaries';
import type { ITourIssue } from '../tour/tour-types';

/**
 * Исключения для отклонения промисов смены сцены: описание ошибки лежит в поле `details`, как у
 * `retry()`.
 */
export const unknownSceneError = (sceneId: string): PanoLoadError =>
  new PanoLoadError(
    createPanoError(EnumErrorCode.UnknownScene, { message: `The tour has no scene "${sceneId}"` }),
  );

export const invalidTourError = (issues: ITourIssue[]): PanoLoadError =>
  new PanoLoadError(createPanoError(EnumErrorCode.InvalidTour, { message: 'The tour is invalid', issues }));
