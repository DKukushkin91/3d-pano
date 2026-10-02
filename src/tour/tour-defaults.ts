import { EnumBoundsMode, EnumFovMode } from './tour-dictionaries';
import type { IResolvedViewLimits, IScene, ITour, IView } from './tour-types';

/**
 * Нейтральные умолчания: 90° по большей стороне кадра и зум не дальше двух CSS-пикселей на пиксель
 * источника. Хосты со своими пределами (neometria — 70–140°) задают их в `tour.defaults`.
 */
export const LIBRARY_DEFAULT_VIEW: Readonly<IView> = {
  yaw: 0,
  pitch: 0,
  roll: 0,
  fov: 90,
  fovMode: EnumFovMode.Max,
  position: Object.freeze({ x: 0, y: 0, z: 0 }),
};

export const LIBRARY_DEFAULT_LIMITS: Readonly<IResolvedViewLimits> = {
  fov: [30, 120],
  maxPixelZoom: 2,
  bounds: EnumBoundsMode.Auto,
};

const firstDefined = <TValue>(fallback: TValue, ...candidates: readonly (TValue | undefined)[]): TValue =>
  candidates.find((candidate) => candidate !== undefined) ?? fallback;

/**
 * Стартовая сцена: указанная в `startScene` или первая в списке. `undefined` бывает только у
 * невалидного тура — его отсекает `validateTour` раньше.
 */
export const findStartScene = (tour: ITour): IScene | undefined =>
  tour.startScene === undefined ? tour.scenes[0] : tour.scenes.find((scene) => scene.id === tour.startScene);

/**
 * Наложение по полям: умолчания библиотеки ← `tour.defaults.view` ← `scene.view`. Поле со значением
 * `undefined` ничего не переопределяет.
 */
export const resolveSceneView = (tour: ITour, scene: IScene): IView => {
  const sceneView = scene.view;
  const tourView = tour.defaults?.view;

  return {
    yaw: firstDefined(LIBRARY_DEFAULT_VIEW.yaw, sceneView?.yaw, tourView?.yaw),
    pitch: firstDefined(LIBRARY_DEFAULT_VIEW.pitch, sceneView?.pitch, tourView?.pitch),
    roll: firstDefined(LIBRARY_DEFAULT_VIEW.roll, sceneView?.roll, tourView?.roll),
    fov: firstDefined(LIBRARY_DEFAULT_VIEW.fov, sceneView?.fov, tourView?.fov),
    fovMode: firstDefined(LIBRARY_DEFAULT_VIEW.fovMode, sceneView?.fovMode, tourView?.fovMode),
    position: { x: 0, y: 0, z: 0 },
  };
};

/**
 * То же для ограничений; объект `bounds` заменяется целиком, а не сливается по диапазонам — граница
 * сцены не должна наследовать половину чужой.
 */
export const resolveSceneLimits = (tour: ITour, scene: IScene): IResolvedViewLimits => {
  const sceneLimits = scene.limits;
  const tourLimits = tour.defaults?.limits;

  return {
    fov: firstDefined(LIBRARY_DEFAULT_LIMITS.fov, sceneLimits?.fov, tourLimits?.fov),
    maxPixelZoom: firstDefined(
      LIBRARY_DEFAULT_LIMITS.maxPixelZoom,
      sceneLimits?.maxPixelZoom,
      tourLimits?.maxPixelZoom,
    ),
    bounds: firstDefined(LIBRARY_DEFAULT_LIMITS.bounds, sceneLimits?.bounds, tourLimits?.bounds),
  };
};
