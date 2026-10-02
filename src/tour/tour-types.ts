import type { IHotspot } from '../hotspots/hotspot-types';
import type { EnumSourceType, TBoundsMode, TCubeFace, TFovMode } from './tour-dictionaries';

/**
 * Панорама одним файлом: полная сфера 360°×180° в эквиректангулярной проекции (обычно 2:1).
 */
export interface IEquirectSource {
  type: typeof EnumSourceType.Equirect;
  url: string;
}

/**
 * Шесть граней куба по шаблону URL: `{face}` заменяется именем грани, а `faceNames` переопределяет имена
 * по умолчанию (`front`, `right`, `back`, `left`, `up`, `down`), например на `f`, `r`, `b`, `l`, `u`, `d`.
 */
export interface ICubeSource {
  type: typeof EnumSourceType.Cube;
  url: string;
  faceNames?: Partial<Record<TCubeFace, string>>;
}

export type TPanoramaSource = IEquirectSource | ICubeSource;

/**
 * Начальный вид сцены. Углы в градусах: `yaw` растёт вправо, `pitch` — вверх (−90…90), положительный
 * `roll` наклоняет горизонт по часовой стрелке.
 */
export interface IViewSettings {
  yaw?: number;
  pitch?: number;
  roll?: number;
  fov?: number;
  fovMode?: TFovMode;
}

/**
 * Вид со всеми полями — то, что возвращает `getView()` и получает событие `viewChange`.
 */
export interface IView {
  yaw: number;
  pitch: number;
  roll: number;
  fov: number;
  fovMode: TFovMode;
}

export type TAngleRange = readonly [min: number, max: number];

/**
 * Диапазоны, внутри которых должен оставаться весь кадр.
 */
export interface IBoundsRanges {
  yaw?: TAngleRange;
  pitch?: TAngleRange;
}

/**
 * Ограничения камеры: пределы FOV, не больше `maxPixelZoom` CSS-пикселей на пиксель источника в центре
 * кадра, границы обзора.
 */
export interface IViewLimits {
  fov?: TAngleRange;
  maxPixelZoom?: number;
  bounds?: TBoundsMode | IBoundsRanges;
}

export interface IResolvedViewLimits {
  fov: TAngleRange;
  maxPixelZoom: number;
  bounds: TBoundsMode | IBoundsRanges;
}

export interface IScene {
  id: string;
  title?: string;
  source: TPanoramaSource;
  preview?: TPanoramaSource;
  view?: IViewSettings;
  limits?: IViewLimits;
  hotspots?: IHotspot[];
}

export interface ITourDefaults {
  view?: IViewSettings;
  limits?: IViewLimits;
}

/**
 * Тур — только данные, без кода: его можно получить ответом сервера и передать как есть.
 */
export interface ITour {
  startScene?: string;
  defaults?: ITourDefaults;
  scenes: IScene[];
}

/**
 * Проблема тура: путь к полю (`scenes[1].id`) и понятное разработчику описание.
 */
export interface ITourIssue {
  path: string;
  message: string;
}
