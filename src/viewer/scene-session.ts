import type { IGlContext } from '../render/gl-context';
import type { TLayerDrawing } from '../render/layer-drawing';
import { type IPanoramaLayer, createPanoramaLayer } from '../render/panorama-layer';
import { PanoLoadError, createPanoError } from '../resources/load-errors';
import { EnumImageRole, createSceneLoader } from '../resources/scene-loader';
import { EnumErrorCode, EnumViewerStatus, type TViewerStatus } from '../state/viewer-dictionaries';
import type { IScene } from '../tour/tour-types';

/**
 * Состояние загрузки сцены, которое просмотрщик переносит в снимок и камеру.
 */
export interface ISceneSessionState {
  status: TViewerStatus;
  loadProgress: number;
  pixelsPerRadian: number | null;
}

export interface ISceneSessionOptions {
  scene: IScene;
  glContext: IGlContext;
  loadImage: (url: string, signal: AbortSignal) => Promise<ImageBitmap>;
  onChange: (state: ISceneSessionState) => void;
}

/**
 * Сцена в работе: её загрузчик и слои в видеопамяти. `load()` догружает недостающее и разрешается, когда
 * основное изображение целиком в текстурах; повторный вызов после ошибки — это `viewer.retry()`.
 */
export interface ISceneSession {
  load: () => Promise<void>;
  drawings: () => TLayerDrawing[];
  hasVisiblePreview: () => boolean;
  dispose: () => void;
}

const statusOf = (previewLayer: IPanoramaLayer | null, mainLayer: IPanoramaLayer): TViewerStatus => {
  if (mainLayer.isComplete()) {
    return EnumViewerStatus.Ready;
  }

  return previewLayer?.isComplete() === true ? EnumViewerStatus.Preview : EnumViewerStatus.Loading;
};

const densityOf = (previewLayer: IPanoramaLayer | null, mainLayer: IPanoramaLayer): number | null => {
  if (mainLayer.isComplete()) {
    return mainLayer.pixelsPerRadian();
  }

  return previewLayer?.isComplete() === true ? previewLayer.pixelsPerRadian() : null;
};

/**
 * Сессия сцены. Статус: `ready`, когда основное изображение целиком в текстурах, `preview`, когда целиком
 * загружено превью. Плотность для ограничения зума берётся по самому подробному слою, который виден
 * целиком: основной источник, а пока он грузится — превью.
 */
export const createSceneSession = (options: ISceneSessionOptions): ISceneSession => {
  const { gl, maxTextureSize } = options.glContext;
  const { scene } = options;
  const previewLayer =
    scene.preview === undefined ? null : createPanoramaLayer(gl, scene.preview.type, maxTextureSize);
  const mainLayer = createPanoramaLayer(gl, scene.source.type, maxTextureSize);
  const pendingUploads = new Set<Promise<void>>();
  let uploadFailure: PanoLoadError | null = null;
  let loadProgress = 0;

  const notify = (): void => {
    options.onChange({
      status: statusOf(previewLayer, mainLayer),
      loadProgress,
      pixelsPerRadian: densityOf(previewLayer, mainLayer),
    });
  };

  const loader = createSceneLoader({
    scene,
    loadImage: options.loadImage,
    onImage: ({ role, layerIndex, image, url }) => {
      const layer = role === EnumImageRole.Preview ? previewLayer : mainLayer;

      if (layer === null) {
        image.close();

        return;
      }

      const upload = layer.addImage(layerIndex, image).then(notify, (error: unknown) => {
        uploadFailure ??= new PanoLoadError(
          createPanoError(EnumErrorCode.DecodeFailed, {
            message: `Could not prepare ${url} for the GPU`,
            url,
            cause: error,
          }),
        );
      });

      pendingUploads.add(upload);
      void upload.then(() => pendingUploads.delete(upload));
    },
    onProgress: (progress) => {
      loadProgress = progress;
      notify();
    },
  });

  const load = async (): Promise<void> => {
    uploadFailure = null;

    try {
      await loader.load();
    } finally {
      await Promise.all(pendingUploads);
    }

    if (uploadFailure !== null) {
      throw uploadFailure;
    }
  };

  return {
    load,
    drawings: () => {
      const mainDrawing = mainLayer.drawing();
      const previewDrawing = mainLayer.isComplete() ? null : previewLayer?.drawing();

      return [previewDrawing, mainDrawing].filter(
        (drawing): drawing is TLayerDrawing => drawing !== null && drawing !== undefined,
      );
    },
    hasVisiblePreview: () => previewLayer?.isComplete() === true,
    dispose: () => {
      loader.abort();
      previewLayer?.dispose();
      mainLayer.dispose();
    },
  };
};
