import type { ISceneSessionState, ISceneTarget } from '../navigation/navigator-types';
import type { IGlContext } from '../render/gl-context';
import { TILED_CUBE_DRAWING, type TLayerDrawing } from '../render/layer-drawing';
import { type ITileBaseLayer, createTileBaseLayer } from '../render/tile-base-layer';
import { createTileTable, tiledLevelUniforms } from '../render/tile-table';
import { PanoLoadError, createPanoError } from '../resources/load-errors';
import { EnumErrorCode, EnumViewerStatus, type TViewerStatus } from '../state/viewer-dictionaries';
import { createPyramidIndex } from '../tiles/pyramid-index';
import { fitFrameTiles } from '../tiles/tile-pool-plan';
import type { ITileWant } from '../tiles/tile-queue';
import { type ITileFrame, neededTilesOf, progressiveTilesOf, sampleTileFrame } from '../tiles/visible-tiles';
import { type TTiledCubeSource, tiledCubeDensity } from '../tour/tile-pyramid';
import type { IScene } from '../tour/tour-types';
import type { ISceneSession } from './scene-session';
import { createTileReadiness } from './tile-readiness';
import { createTileResidency } from './tile-residency';
import type { ITileService, ITileSessionPort } from './tile-service';
import { createTiledPreview } from './tiled-preview';

export interface ITiledSceneSessionOptions {
  scene: IScene;
  source: TTiledCubeSource;
  withPreview: boolean;
  glContext: IGlContext;
  tiles: ITileService;
  loadImage: (url: string, signal: AbortSignal) => Promise<ImageBitmap>;
  frameOf: (target: ISceneTarget, pixelsPerRadian: number) => ITileFrame | null;
  onChange: (state: ISceneSessionState) => void;
}

const abortError = (): Error =>
  Object.assign(new Error('The scene session was disposed'), { name: 'AbortError' });

const statusOf = (isReady: boolean, isVisible: boolean): TViewerStatus => {
  if (isReady) {
    return EnumViewerStatus.Ready;
  }

  return isVisible ? EnumViewerStatus.Preview : EnumViewerStatus.Loading;
};

const frameKeyOf = ({ basis, halfTangents, buffer }: ITileFrame): string =>
  [basis.right, basis.up, basis.forward]
    .flatMap((axis) => [axis.x, axis.y, axis.z])
    .concat(halfTangents.width, halfTangents.height, buffer.width, buffer.height)
    .join(',');

/**
 * Сессия тайловой сцены. Подложка грузится целиком в свою текстуру; тайлы уровней выше — через общую очередь
 * в общий пул. `load(target)` ждёт подложку, превью и тайлы нужного уровня кадра появления; после готовности
 * кадр на экране (`prepareFrame`) запрашивает тайлы всех уровней от грубого к нужному и ведёт их проявление.
 * Статус `preview`, когда видны подложка или превью; плотность для `maxPixelZoom` — по самому подробному
 * уровню.
 */
export const createTiledSceneSession = (options: ITiledSceneSessionOptions): ISceneSession => {
  const { source, tiles, glContext } = options;
  const pyramid = createPyramidIndex(source);
  const { levels, baseLevel, baseUrls } = pyramid;
  const table = createTileTable(glContext.gl, pyramid.entryCount);
  const residency = createTileResidency(table);
  const uniforms = tiledLevelUniforms(levels, pyramid.offsets, source.tileSize);
  const baseLayer: ITileBaseLayer | null =
    baseLevel.faceSize > glContext.maxTextureSize ? null : createTileBaseLayer(glContext.gl, baseLevel);
  const readiness = createTileReadiness();
  const density = tiledCubeDensity(source);
  const uploadedBase = new Set<string>();
  let frameUrls: string[] = [];
  let displayUrls: string[] = [];
  let displayWantKey = '';
  let lastFrameKey = '';
  let isDisplayed = false;
  let hasBeenReady = false;
  let isDisposed = false;

  const notify = (): void => {
    const isVisible = baseLayer?.isComplete() === true || preview.isComplete();

    options.onChange({
      status: statusOf(hasBeenReady && !readiness.hasWaiters(), isVisible),
      loadProgress: readiness.progress() ?? (hasBeenReady ? 1 : 0),
      pixelsPerRadian: isVisible ? density : null,
    });
  };

  const preview = createTiledPreview({
    sceneId: options.scene.id,
    source: options.withPreview ? options.scene.preview : undefined,
    glContext,
    loadImage: options.loadImage,
    onLoaded: (key) => {
      readiness.markAvailable(key);
      notify();
    },
    onFailed: (key, error) => {
      readiness.fail(key, error);
    },
  });

  const isAvailable = (key: string): boolean =>
    preview.isLoaded(key) || uploadedBase.has(key) || residency.isResident(key);

  const updateWants = (): void => {
    const isPreload = !isDisplayed && readiness.isPreloadOnly();
    const pending = readiness.pendingKeys();
    const wanted = new Map<string, ITileWant>();
    const missingBase = baseUrls.filter((url) => !uploadedBase.has(url));

    for (const url of missingBase.length > 0 && (isDisplayed || pending.size > 0) ? missingBase : []) {
      wanted.set(url, { url, level: 0, distance: 0, isPreload });
    }

    for (const url of [...pending, ...displayUrls]) {
      const priority = pyramid.priorityOf(url);

      if (priority !== undefined && !residency.isResident(url) && !wanted.has(url)) {
        wanted.set(url, { ...priority, isPreload });
      }
    }

    tiles.want(port, [...wanted.values()]);
  };

  const readinessKeys = (target: ISceneTarget): string[] => {
    const frame = options.frameOf(target, density);
    const samples = frame === null ? [] : sampleTileFrame(frame, levels, source.tileSize);
    const [needed = []] = fitFrameTiles([neededTilesOf(samples, levels)], tiles.capacity());
    const neededUrls = needed.map((tile) => pyramid.rememberWanted(tile, target.isPreload));

    return [...preview.keys, ...baseUrls, ...neededUrls];
  };

  const load = (target: ISceneTarget): Promise<void> => {
    if (isDisposed) {
      return Promise.reject(abortError());
    }

    if (baseLayer === null) {
      return Promise.reject(
        new PanoLoadError(
          createPanoError(EnumErrorCode.InvalidImage, {
            message: `The smallest level ${String(baseLevel.faceSize)} exceeds the device texture limit`,
            url: baseUrls[0] ?? source.url,
          }),
        ),
      );
    }

    const keys = readinessKeys(target);
    const loading = readiness.add(keys, isAvailable, target.isPreload);

    tiles.forgetFailures(keys);
    preview.start();
    updateWants();
    notify();

    return loading.then(() => {
      hasBeenReady = true;
      notify();
    });
  };

  const port: ITileSessionPort = {
    tileSizeOf: pyramid.tileSizeOf,
    acceptBaseTile: (url, image) => {
      const address = pyramid.addressOf(url);

      if (baseLayer === null || address === undefined || !pyramid.isBaseUrl(url) || uploadedBase.has(url)) {
        return false;
      }

      baseLayer.addTile(address, image);
      uploadedBase.add(url);
      readiness.markAvailable(url);
      updateWants();
      notify();

      return true;
    },
    handlePlaced: (url, slot) => {
      const index = pyramid.tableIndexOf(url);

      if (index === null) {
        return;
      }

      residency.place(url, index, slot, isDisplayed && hasBeenReady && tiles.fadeMs() > 0);
      lastFrameKey = '';
      readiness.markAvailable(url);
      updateWants();
      notify();
    },
    handleDropped: (url) => {
      if (pyramid.addressOf(url) !== undefined) {
        readiness.markAvailable(url);
        notify();
      }
    },
    handleEvicted: (url) => {
      if (residency.isResident(url)) {
        residency.remove(url);
        lastFrameKey = '';
      }
    },
    handleFailed: (url, error) => {
      readiness.fail(url, error);
    },
    handlePoolReset: () => {
      residency.clear();
      lastFrameKey = '';
      updateWants();
    },
    handleHidden: () => {
      if (isDisplayed) {
        isDisplayed = false;
        frameUrls = [];
        displayUrls = [];
        displayWantKey = '';
        lastFrameKey = '';
        updateWants();
      }
    },
  };

  const unregister = tiles.register(port);

  tiles.usePool(source.tileSize);

  const prepareFrame = (frame: ITileFrame, timeMs: number): boolean => {
    const frameKey = frameKeyOf(frame);

    isDisplayed = true;

    if (frameKey !== lastFrameKey) {
      lastFrameKey = frameKey;
      frameUrls = progressiveTilesOf(sampleTileFrame(frame, levels, source.tileSize), levels, (address) =>
        residency.isResident(pyramid.urlOf(address)),
      ).map((tile) => pyramid.rememberWanted(tile, false));
    }

    const claimed = tiles.claimFrame(port, frameUrls);
    const missing = hasBeenReady ? claimed.filter((url) => !residency.isResident(url)) : [];
    const wantKey = missing.join('\n');

    if (wantKey !== displayWantKey) {
      displayWantKey = wantKey;
      displayUrls = missing;
      updateWants();
    }

    const isFading = residency.step(timeMs, tiles.fadeMs());

    table.flush();

    return isFading;
  };

  const drawings = (): TLayerDrawing[] => {
    const previewDrawing = baseLayer?.isComplete() === true ? null : preview.drawing();
    const list: TLayerDrawing[] = previewDrawing === null ? [] : [previewDrawing];

    if (baseLayer !== null && baseLayer.readyFaces() !== 0) {
      list.push({
        type: TILED_CUBE_DRAWING,
        base: baseLayer.textureArray,
        baseFaceSize: baseLayer.faceSize,
        readyFaces: baseLayer.readyFaces(),
        pool: tiles.pool()?.textureArray ?? null,
        table: { texture: table.texture, width: table.width },
        levels: uniforms,
      });
    }

    return list;
  };

  return {
    load,
    isReadyFor: (target) => readinessKeys(target).every(isAvailable),
    drawings,
    prepareFrame,
    byteSize: () => preview.byteSize() + (baseLayer?.byteSize() ?? 0),
    dispose: () => {
      isDisposed = true;
      unregister();
      readiness.rejectAll(abortError());
      preview.dispose();
      baseLayer?.dispose();
      table.dispose();
    },
  };
};
