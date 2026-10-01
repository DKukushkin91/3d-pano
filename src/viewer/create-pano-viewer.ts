import { createInputController } from '../controls/input-controller';
import { observeElementSize, readElementSize } from '../dom/size-observer';
import { createViewerRoot } from '../dom/viewer-root';
import { type ISceneNavigator, createSceneNavigator } from '../navigation/scene-navigator';
import { createGlContext, releaseGlContext } from '../render/gl-context';
import { createRenderLoop } from '../render/render-loop';
import { createPanoError } from '../resources/load-errors';
import { loadImage } from '../resources/load-image';
import { createEventEmitter } from '../state/event-emitter';
import { createSnapshotStore } from '../state/snapshot-store';
import { EnumErrorCode, EnumViewerStatus } from '../state/viewer-dictionaries';
import type { IPanoError } from '../state/viewer-state-types';
import {
  LIBRARY_DEFAULT_LIMITS,
  LIBRARY_DEFAULT_VIEW,
  findStartScene,
  resolveSceneLimits,
  resolveSceneView,
} from '../tour/tour-defaults';
import type { IScene } from '../tour/tour-types';
import { validateTour } from '../tour/validate-tour';
import { createCameraState } from './camera-state';
import { type ISceneSession, createSceneSession } from './scene-session';
import { createViewerGraphics } from './viewer-graphics';
import { areViewerOptionsEqual, resolveViewerOptions } from './viewer-options';
import type { IPanoViewer, IPanoViewerEventMap, IPanoViewerOptions } from './viewer-types';

/**
 * Отладочные настройки, доступные только через служебную точку входа: например, искусственно
 * уменьшенный лимит текстуры, чтобы проверить нарезку на настольной видеокарте.
 */
export interface IViewerDebugOptions {
  maxTextureSize?: number;
}

const assertContainer = (container: unknown): void => {
  if (typeof HTMLElement === 'undefined' || !(container instanceof HTMLElement)) {
    throw new TypeError('3d-pano: the container must be an HTMLElement');
  }
};

const webglUnavailableError = (): IPanoError =>
  createPanoError(EnumErrorCode.WebglUnavailable, { message: 'WebGL2 is not available in this browser' });

/**
 * Сборка просмотрщика: DOM, камера, ввод, отрисовка и навигатор сцен. События стартовой сцены
 * отправляются начиная со следующей микрозадачи: обработчики, подписанные сразу после создания, получают
 * их все, включая ошибки тура и WebGL. Без WebGL2 навигатора нет, и методы смены сцен разрешаются `false`.
 */
export const createViewer = (
  container: HTMLElement,
  options: IPanoViewerOptions,
  debug: IViewerDebugOptions,
): IPanoViewer => {
  assertContainer(container);

  let resolvedOptions = resolveViewerOptions(null, options);
  const { tour } = options;
  const elements = createViewerRoot(container, resolvedOptions.label);
  const emitter = createEventEmitter<IPanoViewerEventMap>();
  const store = createSnapshotStore();
  const tourIssues = validateTour(tour);
  const startScene: IScene | undefined = tourIssues.length === 0 ? findStartScene(tour) : undefined;
  const camera = createCameraState(
    startScene === undefined ? LIBRARY_DEFAULT_VIEW : resolveSceneView(tour, startScene),
    startScene === undefined ? LIBRARY_DEFAULT_LIMITS : resolveSceneLimits(tour, startScene),
    readElementSize(elements.root),
  );
  const glContext = createGlContext(elements.canvas, debug.maxTextureSize ?? null);
  const graphics = glContext === null ? null : createViewerGraphics(glContext, elements.canvas);
  let navigator: ISceneNavigator<ISceneSession> | null = null;
  let isDestroyed = false;

  const renderFrame = (timeMs: number): boolean => {
    const isInputMoving = input.step(timeMs);
    const frame = navigator?.frame(timeMs) ?? null;
    const changedView = camera.takeViewChange();

    if (changedView !== null) {
      emitter.emit('viewChange', { view: changedView });
    }

    if (graphics !== null && frame !== null) {
      graphics.draw(frame, camera, {
        devicePixelRatio: container.ownerDocument.defaultView?.devicePixelRatio ?? 1,
        maxPixelRatio: resolvedOptions.maxPixelRatio,
        renderScale: resolvedOptions.renderScale,
      });
    }

    return isInputMoving || frame?.isAnimating === true;
  };

  const loop = createRenderLoop(renderFrame);
  const input = createInputController(
    {
      root: elements.root,
      canvas: elements.canvas,
      overlay: elements.overlay,
      getView: camera.getView,
      setView: camera.setView,
      getViewport: camera.getViewport,
      requestFrame: loop.requestRender,
    },
    resolvedOptions.controls,
    (isInteracting) => {
      store.update({ isInteracting });
    },
  );
  const stopObservingSize = observeElementSize(elements.root, (size) => {
    camera.setViewport(size);
    loop.requestRender();
  });

  if (glContext !== null) {
    navigator = createSceneNavigator<ISceneSession>(
      {
        createSession: (scene, withPreview, onChange) =>
          createSceneSession({
            scene,
            withPreview,
            glContext,
            loadImage: (url, signal) =>
              loadImage(url, { loader: resolvedOptions.loader, retry: resolvedOptions.retry, signal }),
            onChange,
          }),
        getView: camera.getView,
        present: ({ view, limits, pixelsPerRadian, keepMotion }) => {
          camera.resetScene(view, limits);
          camera.setSourceDensity(pixelsPerRadian);
          input.handleSceneChange(keepMotion);
          loop.requestRender();
        },
        applyLimits: (limits) => {
          camera.setLimits(limits);
          loop.requestRender();
        },
        setSourceDensity: camera.setSourceDensity,
        requestFrame: loop.requestRender,
        store,
        emitter,
      },
      resolvedOptions.sceneCacheMegabytes,
    );
  }

  const reportError = (error: IPanoError): void => {
    store.update({ status: EnumViewerStatus.Error, error });
    emitter.emit('error', { error });
  };

  const start = (): void => {
    if (isDestroyed) {
      return;
    }

    if (navigator === null) {
      reportError(webglUnavailableError());
    } else if (startScene === undefined) {
      reportError(
        createPanoError(EnumErrorCode.InvalidTour, { message: 'The tour is invalid', issues: tourIssues }),
      );
    } else {
      navigator.setTour(tour).catch(() => undefined);
    }

    loop.requestRender();
  };

  const destroy = (): void => {
    if (isDestroyed) {
      return;
    }

    isDestroyed = true;
    input.dispose();
    navigator?.destroy();
    loop.dispose();
    stopObservingSize();
    graphics?.dispose();

    if (glContext !== null) {
      releaseGlContext(glContext.gl);
    }

    elements.remove();
    emitter.clear();
    store.clear();
  };

  queueMicrotask(start);

  return {
    overlay: elements.overlay,
    getView: camera.getView,
    setView: (settings) => {
      if (!isDestroyed) {
        camera.setView(settings);
        loop.requestRender();
      }
    },
    project: (point) => (isDestroyed ? null : camera.project(point)),
    unproject: (x, y) => (isDestroyed ? null : camera.unproject(x, y)),
    showScene: (sceneId, showOptions) => navigator?.showScene(sceneId, showOptions) ?? Promise.resolve(false),
    preloadScene: (sceneId) => navigator?.preloadScene(sceneId) ?? Promise.resolve(false),
    setTour: (nextTour, tourOptions) => navigator?.setTour(nextTour, tourOptions) ?? Promise.resolve(false),
    retry: () => navigator?.retry() ?? Promise.resolve(),
    update: (nextOptions) => {
      if (isDestroyed) {
        return;
      }

      const nextResolvedOptions = resolveViewerOptions(resolvedOptions, nextOptions);

      if (areViewerOptionsEqual(resolvedOptions, nextResolvedOptions)) {
        return;
      }

      resolvedOptions = nextResolvedOptions;
      elements.setLabel(resolvedOptions.label);
      input.update(resolvedOptions.controls);
      navigator?.setCacheBudget(resolvedOptions.sceneCacheMegabytes);
      loop.requestRender();
    },
    on: (name, handler) => (isDestroyed ? () => undefined : emitter.on(name, handler)),
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,
    destroy,
  };
};

/**
 * Создаёт независимый просмотрщик панорамы внутри `container`. Контейнер хоста не меняется: библиотека
 * добавляет в него свой корневой элемент с canvas и оверлеем и удаляет его в `destroy()`.
 */
export const createPanoViewer = (container: HTMLElement, options: IPanoViewerOptions): IPanoViewer =>
  createViewer(container, options, {});
