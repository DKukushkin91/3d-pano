import type { IGlContext } from '../render/gl-context';
import type { TLayerDrawing } from '../render/layer-drawing';
import { type IPanoramaLayer, createPanoramaLayer } from '../render/panorama-layer';
import { PanoLoadError, createPanoError, isAbortError } from '../resources/load-errors';
import { type ISceneLoader, createSceneLoader, listSceneImages } from '../resources/scene-loader';
import { EnumErrorCode } from '../state/viewer-dictionaries';
import type { TPanoramaSource } from '../tour/tour-types';

/**
 * Превью тайловой сцены: обычный источник, который грузится целиком мимо очереди тайлов. Ключи его
 * изображений (`preview:0`…) входят в наборы готовности вместе с тайлами.
 */
export interface ITiledPreview {
  keys: readonly string[];
  isLoaded: (key: string) => boolean;
  isComplete: () => boolean;
  start: () => void;
  drawing: () => TLayerDrawing | null;
  byteSize: () => number;
  dispose: () => void;
}

export interface ITiledPreviewOptions {
  sceneId: string;
  source: TPanoramaSource | undefined;
  glContext: IGlContext;
  loadImage: (url: string, signal: AbortSignal) => Promise<ImageBitmap>;
  onLoaded: (key: string) => void;
  onFailed: (key: string, error: unknown) => void;
}

const previewKey = (layerIndex: number): string => `preview:${String(layerIndex)}`;

const EMPTY_PREVIEW: ITiledPreview = Object.freeze({
  keys: [],
  isLoaded: () => false,
  isComplete: () => false,
  start: () => undefined,
  drawing: () => null,
  byteSize: () => 0,
  dispose: () => undefined,
});

const gpuFailure = (url: string, error: unknown): PanoLoadError =>
  new PanoLoadError(
    createPanoError(EnumErrorCode.DecodeFailed, {
      message: `Could not prepare ${url} for the GPU`,
      url,
      cause: error,
    }),
  );

/**
 * Без источника превью — пустое: ключей нет, рисовать нечего.
 */
export const createTiledPreview = (options: ITiledPreviewOptions): ITiledPreview => {
  const { source } = options;

  if (source === undefined) {
    return EMPTY_PREVIEW;
  }

  const { gl, maxTextureSize } = options.glContext;
  const scene = { id: options.sceneId, source };
  const keys = listSceneImages(scene).main.map((image) => previewKey(image.layerIndex));
  const layer: IPanoramaLayer = createPanoramaLayer(gl, source.type, maxTextureSize);
  const loaded = new Set<string>();
  let loader: ISceneLoader | null = null;
  let isLoading = false;

  const failMissing = (error: unknown): void => {
    for (const key of keys) {
      if (!loaded.has(key)) {
        options.onFailed(key, error);
      }
    }
  };

  const start = (): void => {
    if (isLoading || loaded.size === keys.length) {
      return;
    }

    loader ??= createSceneLoader({
      scene,
      loadImage: options.loadImage,
      onImage: ({ layerIndex, image, url }) => {
        const key = previewKey(layerIndex);

        layer.addImage(layerIndex, image).then(
          () => {
            loaded.add(key);
            options.onLoaded(key);
          },
          (error: unknown) => {
            options.onFailed(key, gpuFailure(url, error));
          },
        );
      },
      onProgress: () => undefined,
    });
    isLoading = true;
    loader.load().then(
      () => {
        isLoading = false;
      },
      (error: unknown) => {
        isLoading = false;

        if (!isAbortError(error)) {
          failMissing(error);
        }
      },
    );
  };

  return {
    keys,
    isLoaded: (key) => loaded.has(key),
    isComplete: layer.isComplete,
    start,
    drawing: layer.drawing,
    byteSize: layer.byteSize,
    dispose: () => {
      loader?.abort();
      layer.dispose();
    },
  };
};
