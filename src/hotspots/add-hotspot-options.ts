import { VIEW_TARGET_REQUIREMENT, parseViewTarget } from '../viewer/view-target';
import type { ISpherePoint, TViewTarget } from '../viewer/viewer-types';
import { EnumHotspotAnchor, type THotspotAnchor, isHotspotAnchor } from './hotspot-dictionaries';
import type { IAddHotspotOptions } from './hotspot-types';
import { type TResolvedSurface, resolveHotspotSurface } from './surface-options';

/**
 * Плоскость с подставленными умолчаниями: без `facing` лицевая сторона смотрит в центр панорамы.
 */
export interface IResolvedHotspotPlane {
  width: number;
  facing: ISpherePoint | undefined;
  spin: number;
}

/**
 * Хотспот хоста после проверки: `scene: null` — показан в любой сцене, `plane: null` — плоский на экране,
 * `surface: null` — без поверхности.
 */
export interface IResolvedHostHotspot {
  element: HTMLElement;
  position: TViewTarget;
  scene: string | null;
  anchor: THotspotAnchor;
  plane: IResolvedHotspotPlane | null;
  surface: TResolvedSurface | null;
}

const failField = (name: string, requirement: string, value: unknown): never => {
  throw new RangeError(`3d-pano: hotspot "${name}" must be ${requirement}, got ${String(value)}`);
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const resolveHotspotPosition = (value: unknown): TViewTarget =>
  parseViewTarget(value) ?? failField('position', VIEW_TARGET_REQUIREMENT, value);

export const resolveHotspotScene = (value: unknown): string | null => {
  if (value === undefined) {
    return null;
  }

  return typeof value === 'string' ? value : failField('scene', 'a string', value);
};

export const resolveHotspotAnchor = (value: unknown): THotspotAnchor => {
  if (value === undefined) {
    return EnumHotspotAnchor.Center;
  }

  return isHotspotAnchor(value)
    ? value
    : failField('anchor', `one of ${Object.values(EnumHotspotAnchor).join(', ')}`, value);
};

const resolveFacing = (value: unknown): ISpherePoint | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value) || !isFiniteNumber(value.yaw) || !isFiniteNumber(value.pitch)) {
    return failField('plane.facing', 'a { yaw, pitch } direction with finite angles', value);
  }

  return { yaw: value.yaw, pitch: value.pitch };
};

const resolveSpin = (value: unknown): number => {
  if (value === undefined) {
    return 0;
  }

  return isFiniteNumber(value) ? value : failField('plane.spin', 'a finite number of degrees', value);
};

export const resolveHotspotPlane = (value: unknown): IResolvedHotspotPlane | null => {
  if (value === undefined) {
    return null;
  }

  if (!isRecord(value)) {
    return failField('plane', 'an object', value);
  }

  if (!isFiniteNumber(value.width) || value.width <= 0) {
    return failField('plane.width', 'a finite number > 0', value.width);
  }

  return { width: value.width, facing: resolveFacing(value.facing), spin: resolveSpin(value.spin) };
};

const resolveElement = (value: unknown): HTMLElement => {
  if (typeof HTMLElement === 'undefined' || !(value instanceof HTMLElement)) {
    throw new TypeError('3d-pano: hotspot "element" must be an HTMLElement');
  }

  return value;
};

/**
 * Проверяет аргументы `addHotspot`: элемент не того типа — `TypeError`, как контейнер просмотрщика,
 * остальное — `RangeError` с именем поля. Сцена, которой нет в туре, ошибкой не считается: она может
 * появиться в новом туре, а пока хотспот просто не виден.
 */
export const resolveAddHotspotOptions = (options: IAddHotspotOptions): IResolvedHostHotspot => ({
  element: resolveElement(options.element),
  position: resolveHotspotPosition(options.position),
  scene: resolveHotspotScene(options.scene),
  anchor: resolveHotspotAnchor(options.anchor),
  plane: resolveHotspotPlane(options.plane),
  surface: resolveHotspotSurface(options.surface),
});
