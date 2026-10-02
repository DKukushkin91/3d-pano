import type { TAddHotspotSurface } from './hotspot-types';

/**
 * Вид источника поверхности: картинка рисуется один раз после заливки, видео — каждым новым кадром.
 */
export const EnumSurfaceKind = {
  Image: 'image',
  Video: 'video',
} as const;

export type TSurfaceKind = (typeof EnumSurfaceKind)[keyof typeof EnumSurfaceKind];

export type TSurfaceImageSource = string | HTMLImageElement | HTMLCanvasElement | ImageBitmap;

export type TSurfaceVideoSource = string | HTMLVideoElement;

/**
 * Поверхность после проверки: вид, источник и ширина в единицах мира (`null` — ширина плоскости).
 */
export type TResolvedSurface =
  | { kind: typeof EnumSurfaceKind.Image; source: TSurfaceImageSource; width: number | null }
  | { kind: typeof EnumSurfaceKind.Video; source: TSurfaceVideoSource; width: number | null };

const IMAGE_REQUIREMENT = 'a non-empty URL string, HTMLImageElement, HTMLCanvasElement or ImageBitmap';
const VIDEO_REQUIREMENT = 'a non-empty URL string or HTMLVideoElement';

const failSurfaceField = (name: string, requirement: string, value: unknown): never => {
  throw new RangeError(`3d-pano: hotspot "${name}" must be ${requirement}, got ${String(value)}`);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isUrl = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

const isImageElement = (value: unknown): value is HTMLImageElement | HTMLCanvasElement =>
  (typeof HTMLImageElement !== 'undefined' && value instanceof HTMLImageElement) ||
  (typeof HTMLCanvasElement !== 'undefined' && value instanceof HTMLCanvasElement);

const isImageBitmap = (value: unknown): value is ImageBitmap =>
  typeof ImageBitmap !== 'undefined' && value instanceof ImageBitmap;

const isImageSource = (value: unknown): value is TSurfaceImageSource =>
  isUrl(value) || isImageElement(value) || isImageBitmap(value);

const isVideoSource = (value: unknown): value is TSurfaceVideoSource =>
  isUrl(value) || (typeof HTMLVideoElement !== 'undefined' && value instanceof HTMLVideoElement);

const resolveWidth = (value: unknown): number | null => {
  if (value === undefined) {
    return null;
  }

  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : failSurfaceField('surface.width', 'a finite number > 0', value);
};

/**
 * Проверяет `surface` хотспота хоста: ровно один источник — картинка (URL, `<img>`, `<canvas>`,
 * `ImageBitmap`) или видео (URL, `<video>`), необязательная положительная `width`. Ошибка — `RangeError` с
 * именем поля, как у остальных полей `addHotspot`. Отсутствие `plane` ошибкой не считается: поверхность
 * просто не рисуется, пока плоскости нет, и порядок вызова `setPlane` и `setSurface` не важен.
 */
export const resolveHotspotSurface = (value: unknown): TResolvedSurface | null => {
  if (value === undefined) {
    return null;
  }

  if (!isRecord(value)) {
    return failSurfaceField('surface', 'an object with "image" or "video"', value);
  }

  if ((value.image === undefined) === (value.video === undefined)) {
    return failSurfaceField('surface', 'an object with exactly one of "image" or "video"', value);
  }

  if (value.image !== undefined) {
    const image = isImageSource(value.image)
      ? value.image
      : failSurfaceField('surface.image', IMAGE_REQUIREMENT, value.image);

    return { kind: EnumSurfaceKind.Image, source: image, width: resolveWidth(value.width) };
  }

  const video = isVideoSource(value.video)
    ? value.video
    : failSurfaceField('surface.video', VIDEO_REQUIREMENT, value.video);

  return { kind: EnumSurfaceKind.Video, source: video, width: resolveWidth(value.width) };
};

/**
 * Одна и та же ли поверхность для `<Hotspot>`: URL и `width` сравниваются по значению, элементы — по
 * ссылке. Новый объект `surface` с теми же полями в каждом рендере не вызывает `setSurface`.
 */
export const isSameSurface = (
  previous: TAddHotspotSurface | undefined,
  next: TAddHotspotSurface | undefined,
): boolean =>
  previous?.image === next?.image && previous?.video === next?.video && previous?.width === next?.width;
