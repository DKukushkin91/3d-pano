import { EnumErrorCode } from '../state/viewer-dictionaries';
import { EnumSourceType } from '../tour/tour-dictionaries';
import type { IScene, TPanoramaSource } from '../tour/tour-types';
import { expandCubeFaceUrls } from '../tour/url-template';
import { PanoLoadError, createPanoError, isAbortError } from './load-errors';
import { loadProgress } from './load-progress';

/**
 * Роль изображения в сцене: превью показывается первым и остаётся подложкой, основной источник
 * проявляется поверх него по мере загрузки.
 */
export const EnumImageRole = {
  Preview: 'preview',
  Main: 'main',
} as const;

export type TImageRole = (typeof EnumImageRole)[keyof typeof EnumImageRole];

/**
 * Одно изображение сцены: для куба `layerIndex` — номер грани в порядке `CUBE_FACES`, для
 * эквиректангулярного источника — 0.
 */
export interface ISceneImage {
  role: TImageRole;
  source: TPanoramaSource;
  layerIndex: number;
  url: string;
}

export interface ILoadedSceneImage extends ISceneImage {
  image: ImageBitmap;
}

export interface ISceneLoaderOptions {
  scene: IScene;
  loadImage: (url: string, signal: AbortSignal) => Promise<ImageBitmap>;
  onImage: (loaded: ILoadedSceneImage) => void;
  onProgress: (progress: number) => void;
}

/**
 * `load()` догружает всё, что ещё не загружено, — повторный вызов после ошибки и есть `viewer.retry()`.
 */
export interface ISceneLoader {
  load: () => Promise<void>;
  abort: () => void;
}

const sourceImages = (role: TImageRole, source: TPanoramaSource): ISceneImage[] =>
  source.type === EnumSourceType.Cube
    ? expandCubeFaceUrls(source).map(({ url }, layerIndex) => ({ role, source, layerIndex, url }))
    : [{ role, source, layerIndex: 0, url: source.url }];

/**
 * Изображения сцены по ролям: сначала превью, затем основной источник.
 */
export const listSceneImages = (scene: IScene): { preview: ISceneImage[]; main: ISceneImage[] } => ({
  preview: scene.preview === undefined ? [] : sourceImages(EnumImageRole.Preview, scene.preview),
  main: sourceImages(EnumImageRole.Main, scene.source),
});

const imageKey = (request: ISceneImage): string => `${request.role}:${String(request.layerIndex)}`;

const invalidFace = (request: ISceneImage, message: string): PanoLoadError =>
  new PanoLoadError(createPanoError(EnumErrorCode.InvalidImage, { message, url: request.url }));

const firstFailure = (results: readonly PromiseSettledResult<void>[]): unknown => {
  const rejected = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected' && !isAbortError(result.reason),
  );

  return rejected?.reason;
};

/**
 * Загружает изображения сцены: превью, затем все основные параллельно. Сбой одного изображения не
 * останавливает остальные — `load()` отклоняется первой ошибкой, когда всё завершилось. Грани куба обязаны
 * быть квадратными и одного размера внутри роли.
 */
export const createSceneLoader = (options: ISceneLoaderOptions): ISceneLoader => {
  const controller = new AbortController();
  const { preview, main } = listSceneImages(options.scene);
  const totalCount = preview.length + main.length;
  const loadedKeys = new Set<string>();
  const faceSizeByRole = new Map<TImageRole, number>();

  const validateCubeFace = (request: ISceneImage, image: ImageBitmap): void => {
    if (request.source.type !== EnumSourceType.Cube) {
      return;
    }

    if (image.width !== image.height) {
      throw invalidFace(
        request,
        `Cube face ${request.url} is ${String(image.width)}×${String(image.height)}, expected a square`,
      );
    }

    const expectedSize = faceSizeByRole.get(request.role) ?? image.width;

    if (image.width !== expectedSize) {
      throw invalidFace(
        request,
        `Cube face ${request.url} is ${String(image.width)} px, the other faces are ${String(expectedSize)} px`,
      );
    }

    faceSizeByRole.set(request.role, expectedSize);
  };

  const loadOne = async (request: ISceneImage): Promise<void> => {
    const image = await options.loadImage(request.url, controller.signal);

    try {
      validateCubeFace(request, image);
    } catch (error) {
      image.close();
      throw error;
    }

    if (controller.signal.aborted) {
      image.close();

      return;
    }

    loadedKeys.add(imageKey(request));
    options.onImage({ ...request, image });
    options.onProgress(loadProgress(loadedKeys.size, totalCount));
  };

  const loadMissing = (requests: readonly ISceneImage[]): Promise<PromiseSettledResult<void>[]> =>
    Promise.allSettled(requests.filter((request) => !loadedKeys.has(imageKey(request))).map(loadOne));

  const load = async (): Promise<void> => {
    const previewResults = await loadMissing(preview);
    const mainResults = await loadMissing(main);
    const failure = firstFailure([...previewResults, ...mainResults]);

    if (failure !== undefined) {
      throw failure;
    }
  };

  const abort = (): void => {
    controller.abort();
  };

  return { load, abort };
};
