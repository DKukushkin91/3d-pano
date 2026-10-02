import { EnumSurfaceKind, type TResolvedSurface } from '../hotspots/surface-options';
import type { TSurfaceTextureSource } from '../render/surface-texture';
import type { ISurfaceSize, TSurfaceLoad } from './surface-store';
import { type IVideoFrames, createTourVideo, waitForVideoData, watchVideoFrames } from './surface-video';

/**
 * Полученный источник поверхности: что заливать в текстуру и, у видео, его новые кадры.
 */
export interface ISurfaceMedia {
  media: TSurfaceTextureSource;
  frames: IVideoFrames | null;
}

/**
 * Что нужно источникам: документ для `<video>` тура, загрузка картинки по URL путём изображений сцен и
 * просьба о новом кадре, когда видео показало следующий.
 */
export interface ISurfaceSourceContext {
  ownerDocument: Document;
  loadImage: (url: string, signal: AbortSignal, decode: ImageBitmapOptions) => Promise<ImageBitmap>;
  requestFrame: () => void;
}

const PREMULTIPLIED: ImageBitmapOptions = { premultiplyAlpha: 'premultiply' };

const isImageElement = (source: unknown): source is HTMLImageElement =>
  typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement;

const isVideoElement = (source: unknown): source is HTMLVideoElement =>
  typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement;

const stillImage = (media: TSurfaceTextureSource): ISurfaceMedia => ({ media, frames: null });

const waitForImage = (image: HTMLImageElement, signal: AbortSignal): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    if (image.complete && image.naturalWidth > 0) {
      resolve(image);

      return;
    }

    const controller = new AbortController();
    const listening = { signal: controller.signal };

    image.addEventListener(
      'load',
      () => {
        controller.abort();
        resolve(image);
      },
      listening,
    );
    image.addEventListener(
      'error',
      () => {
        controller.abort();
        reject(new Error('3d-pano: the surface image could not be loaded'));
      },
      listening,
    );
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  });

/**
 * Ключ источника в хранилище: URL — вместе с видом (картинка и видео по одному URL — разные источники),
 * элемент или `ImageBitmap` — сам объект.
 */
export const surfaceKeyOf = (surface: TResolvedSurface): unknown =>
  typeof surface.source === 'string' ? `${surface.kind}:${surface.source}` : surface.source;

const videoLoadOf = (
  source: string | HTMLVideoElement,
  context: ISurfaceSourceContext,
): TSurfaceLoad<ISurfaceMedia> => {
  const videoOf = (signal: AbortSignal): Promise<HTMLVideoElement> =>
    typeof source === 'string'
      ? createTourVideo(context.ownerDocument, source, signal)
      : waitForVideoData(source, signal);

  return async (signal) => {
    const video = await videoOf(signal);

    return { media: video, frames: watchVideoFrames(video, context.requestFrame, signal) };
  };
};

/**
 * Как получить источник: картинка по URL — загрузкой изображения с предумноженной альфой, `<img>` — после
 * его загрузки, `<canvas>` и `ImageBitmap` — сразу; видео по URL создаёт библиотека, `<video>` хоста
 * ждёт своего кадра, а воспроизведением управляет хост.
 */
export const surfaceLoadOf = (
  surface: TResolvedSurface,
  context: ISurfaceSourceContext,
): TSurfaceLoad<ISurfaceMedia> => {
  if (surface.kind === EnumSurfaceKind.Video) {
    return videoLoadOf(surface.source, context);
  }

  const { source } = surface;

  if (typeof source === 'string') {
    return async (signal) => stillImage(await context.loadImage(source, signal, PREMULTIPLIED));
  }

  if (isImageElement(source)) {
    return async (signal) => stillImage(await waitForImage(source, signal));
  }

  return () => Promise.resolve(stillImage(source));
};

/**
 * Размер источника в пикселях: у `<img>` и `<video>` — собственный, у `<canvas>` и `ImageBitmap` — размер
 * буфера.
 */
export const surfaceSizeOf = ({ media }: ISurfaceMedia): ISurfaceSize => {
  if (isVideoElement(media)) {
    return { width: media.videoWidth, height: media.videoHeight };
  }

  if (isImageElement(media)) {
    return { width: media.naturalWidth, height: media.naturalHeight };
  }

  return { width: media.width, height: media.height };
};
