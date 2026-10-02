import type { TRenderHotspot } from '../hotspots/hotspot-types';
import type { TImageLoader } from '../resources/load-image';
import { DEFAULT_RETRY_OPTIONS, type IResolvedRetryOptions, type IRetryOptions } from '../resources/retry';
import { CONTROLS_OPTION_KEYS } from './controls-option-keys';
import type { IControlsOptions, TPanoViewerUpdate, TResolvedControlsOptions } from './viewer-types';

/**
 * Опции работающего просмотрщика со всеми значениями.
 */
export interface IResolvedViewerOptions {
  label: string;
  loader: TImageLoader | null;
  retry: IResolvedRetryOptions;
  controls: TResolvedControlsOptions;
  maxPixelRatio: number;
  renderScale: number;
  sceneCacheMegabytes: number;
  tileCacheMegabytes: number;
  tileFadeMs: number;
  renderHotspot: TRenderHotspot | null;
}

export const DEFAULT_CONTROLS_OPTIONS: Readonly<TResolvedControlsOptions> = {
  drag: true,
  wheel: true,
  pinch: true,
  keyboard: true,
  inertia: true,
  wheelSpeed: 1,
  keyboardSpeed: 1,
  inertiaFriction: 1,
  invertDrag: false,
};

export const DEFAULT_MAX_PIXEL_RATIO = 2;
export const DEFAULT_RENDER_SCALE = 1;
export const DEFAULT_SCENE_CACHE_MEGABYTES = 256;
export const DEFAULT_TILE_CACHE_MEGABYTES = 128;
export const DEFAULT_TILE_FADE_MS = 200;

const failRange = (name: string, requirement: string, value: unknown): never => {
  throw new RangeError(`3d-pano: option "${name}" must be ${requirement}, got ${String(value)}`);
};

const positiveNumber = (name: string, value: number): number =>
  Number.isFinite(value) && value > 0 ? value : failRange(name, 'a finite number > 0', value);

const nonNegativeNumber = (name: string, value: number): number =>
  Number.isFinite(value) && value >= 0 ? value : failRange(name, 'a finite number >= 0', value);

const resolveLabel = (value: unknown): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(
      '3d-pano: option "label" must be a non-empty string — it is the accessible name of the viewer',
    );
  }

  return value;
};

const resolveLoader = (value: TImageLoader | undefined): TImageLoader | null => {
  if (value === undefined) {
    return null;
  }

  if (typeof value !== 'function') {
    throw new TypeError('3d-pano: option "loader" must be a function');
  }

  return value;
};

const resolveRenderHotspot = (value: TRenderHotspot | undefined): TRenderHotspot | null => {
  if (value === undefined) {
    return null;
  }

  if (typeof value !== 'function') {
    throw new TypeError('3d-pano: option "renderHotspot" must be a function');
  }

  return value;
};

const resolveRetry = (value: IRetryOptions | undefined): IResolvedRetryOptions => {
  const attempts = value?.attempts ?? DEFAULT_RETRY_OPTIONS.attempts;
  const delayMs = value?.delayMs ?? DEFAULT_RETRY_OPTIONS.delayMs;

  if (!Number.isInteger(attempts) || attempts < 0) {
    failRange('retry.attempts', 'an integer >= 0', attempts);
  }

  if (!Number.isFinite(delayMs) || delayMs < 0) {
    failRange('retry.delayMs', 'a finite number >= 0', delayMs);
  }

  return { attempts, delayMs };
};

const resolveControls = (value: IControlsOptions | undefined): TResolvedControlsOptions => ({
  drag: value?.drag ?? DEFAULT_CONTROLS_OPTIONS.drag,
  wheel: value?.wheel ?? DEFAULT_CONTROLS_OPTIONS.wheel,
  pinch: value?.pinch ?? DEFAULT_CONTROLS_OPTIONS.pinch,
  keyboard: value?.keyboard ?? DEFAULT_CONTROLS_OPTIONS.keyboard,
  inertia: value?.inertia ?? DEFAULT_CONTROLS_OPTIONS.inertia,
  invertDrag: value?.invertDrag ?? DEFAULT_CONTROLS_OPTIONS.invertDrag,
  wheelSpeed: positiveNumber('controls.wheelSpeed', value?.wheelSpeed ?? DEFAULT_CONTROLS_OPTIONS.wheelSpeed),
  keyboardSpeed: positiveNumber(
    'controls.keyboardSpeed',
    value?.keyboardSpeed ?? DEFAULT_CONTROLS_OPTIONS.keyboardSpeed,
  ),
  inertiaFriction: positiveNumber(
    'controls.inertiaFriction',
    value?.inertiaFriction ?? DEFAULT_CONTROLS_OPTIONS.inertiaFriction,
  ),
});

/**
 * Применяет обновление к текущим опциям и проверяет их. Ошибки программиста — синхронные `TypeError` и
 * `RangeError` с префиксом `3d-pano:` и именем опции, как в video-scrubber.
 */
export const resolveViewerOptions = (
  current: IResolvedViewerOptions | null,
  next: TPanoViewerUpdate,
): IResolvedViewerOptions => {
  const has = (key: keyof TPanoViewerUpdate): boolean => current === null || Object.hasOwn(next, key);

  return {
    label: has('label') ? resolveLabel(next.label) : (current?.label ?? resolveLabel(next.label)),
    loader: has('loader') ? resolveLoader(next.loader) : (current?.loader ?? null),
    retry: has('retry') ? resolveRetry(next.retry) : (current?.retry ?? DEFAULT_RETRY_OPTIONS),
    controls: has('controls')
      ? resolveControls(next.controls)
      : (current?.controls ?? DEFAULT_CONTROLS_OPTIONS),
    maxPixelRatio: has('maxPixelRatio')
      ? positiveNumber('maxPixelRatio', next.maxPixelRatio ?? DEFAULT_MAX_PIXEL_RATIO)
      : (current?.maxPixelRatio ?? DEFAULT_MAX_PIXEL_RATIO),
    renderScale: has('renderScale')
      ? positiveNumber('renderScale', next.renderScale ?? DEFAULT_RENDER_SCALE)
      : (current?.renderScale ?? DEFAULT_RENDER_SCALE),
    sceneCacheMegabytes: has('sceneCacheMegabytes')
      ? nonNegativeNumber('sceneCacheMegabytes', next.sceneCacheMegabytes ?? DEFAULT_SCENE_CACHE_MEGABYTES)
      : (current?.sceneCacheMegabytes ?? DEFAULT_SCENE_CACHE_MEGABYTES),
    tileCacheMegabytes: has('tileCacheMegabytes')
      ? nonNegativeNumber('tileCacheMegabytes', next.tileCacheMegabytes ?? DEFAULT_TILE_CACHE_MEGABYTES)
      : (current?.tileCacheMegabytes ?? DEFAULT_TILE_CACHE_MEGABYTES),
    tileFadeMs: has('tileFadeMs')
      ? nonNegativeNumber('tileFadeMs', next.tileFadeMs ?? DEFAULT_TILE_FADE_MS)
      : (current?.tileFadeMs ?? DEFAULT_TILE_FADE_MS),
    renderHotspot: has('renderHotspot')
      ? resolveRenderHotspot(next.renderHotspot)
      : (current?.renderHotspot ?? null),
  };
};

const comparableValues = (options: IResolvedViewerOptions): readonly unknown[] => [
  options.label,
  options.loader,
  options.maxPixelRatio,
  options.renderScale,
  options.sceneCacheMegabytes,
  options.tileCacheMegabytes,
  options.tileFadeMs,
  options.renderHotspot,
  options.retry.attempts,
  options.retry.delayMs,
  ...CONTROLS_OPTION_KEYS.map((key) => options.controls[key]),
];

/**
 * Совпадают ли опции по значению. `update()` с теми же значениями ничего не делает — React-хук может
 * передавать опции после каждого рендера, не заставляя просмотрщик перерисовывать кадр.
 */
export const areViewerOptionsEqual = (
  first: IResolvedViewerOptions,
  second: IResolvedViewerOptions,
): boolean => {
  const secondValues = comparableValues(second);

  return comparableValues(first).every((value, index) => Object.is(value, secondValues[index]));
};
