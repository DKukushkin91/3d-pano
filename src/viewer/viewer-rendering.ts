import type { IGlContext } from '../render/gl-context';
import { type TImageLoader, loadImage } from '../resources/load-image';
import type { IResolvedRetryOptions } from '../resources/retry';
import { type ITileService, createTileService } from './tile-service';
import { type IViewerGraphics, createViewerGraphics } from './viewer-graphics';
import type { IResolvedViewerOptions } from './viewer-options';

/**
 * Настройки загрузки изображений на момент запроса: опции просмотрщика меняются через `update`.
 */
export type TReadLoading = () => { loader: TImageLoader | null; retry: IResolvedRetryOptions };

/**
 * Отрисовка просмотрщика: служба тайлов, графика с поверхностями хотспотов и чтение настроек загрузки.
 * Без WebGL2 служб нет.
 */
export interface IViewerRendering {
  tiles: ITileService | null;
  graphics: IViewerGraphics | null;
  readLoading: TReadLoading;
}

export interface IViewerRenderingParts {
  glContext: IGlContext | null;
  canvas: HTMLCanvasElement;
  readOptions: () => IResolvedViewerOptions;
  requestFrame: () => void;
}

/**
 * Собирает тайлы и графику вокруг одного загрузчика изображений: тайлы, сцены и картинки поверхностей
 * читают `loader` и `retry` в момент запроса, поэтому `update` действует и на уже идущие сцены.
 */
export const createViewerRendering = (parts: IViewerRenderingParts): IViewerRendering => {
  const { glContext, readOptions, requestFrame } = parts;
  const readLoading: TReadLoading = () => ({ loader: readOptions().loader, retry: readOptions().retry });
  const loadViewerImage = (
    url: string,
    signal: AbortSignal,
    decode?: ImageBitmapOptions,
  ): Promise<ImageBitmap> => loadImage(url, { ...readLoading(), signal, decode });

  if (glContext === null) {
    return { tiles: null, graphics: null, readLoading };
  }

  const tiles = createTileService({
    gl: glContext.gl,
    loadImage: loadViewerImage,
    requestFrame,
    budgetMegabytes: readOptions().tileCacheMegabytes,
    fadeMs: readOptions().tileFadeMs,
  });
  const graphics = createViewerGraphics(glContext, parts.canvas, tiles, {
    ownerDocument: parts.canvas.ownerDocument,
    loadImage: loadViewerImage,
    requestFrame,
  });

  return { tiles, graphics, readLoading };
};
