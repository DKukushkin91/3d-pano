import type { IDirection } from '../viewer/viewer-types';
import type { IScene, ITour } from './tour-types';

/**
 * Место сцены в мире с умолчаниями: `position` — `null`, если не задана (тогда переход «шаг» берёт точку
 * из перехода, хотспота или кадра), `heading` — 0, `cameraHeight` — из сцены, иначе из `tour.defaults`,
 * иначе `null` (модель сцены — одна сфера, без пола).
 */
export interface IScenePlace {
  position: IDirection | null;
  heading: number;
  cameraHeight: number | null;
}

export const resolveScenePlace = (tour: ITour, scene: IScene): IScenePlace => ({
  position: scene.position ?? null,
  heading: scene.heading ?? 0,
  cameraHeight: scene.cameraHeight ?? tour.defaults?.cameraHeight ?? null,
});
