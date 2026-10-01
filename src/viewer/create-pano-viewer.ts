import { createInputController } from '../controls/input-controller';
import { drawingBufferSize } from '../dom/drawing-buffer-size';
import { observeElementSize, readElementSize } from '../dom/size-observer';
import { createViewerRoot } from '../dom/viewer-root';
import { createGlContext, releaseGlContext } from '../render/gl-context';
import { createRenderLoop } from '../render/render-loop';
import { type IRenderer, createRenderer } from '../render/renderer';
import { createPanoError, isAbortError, toPanoError } from '../resources/load-errors';
import { loadImage } from '../resources/load-image';
import { createEventEmitter } from '../state/event-emitter';
import { createSnapshotStore } from '../state/snapshot-store';
import { EnumErrorCategory, EnumErrorCode, EnumViewerStatus } from '../state/viewer-dictionaries';
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
import { type ISceneSession, type ISceneSessionState, createSceneSession } from './scene-session';
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
 * Сборка просмотрщика. События стартовой сцены отправляются начиная со следующей микрозадачи: обработчики,
 * подписанные сразу после создания, получают их все, включая ошибки тура и WebGL.
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
  const renderer: IRenderer | null = glContext === null ? null : createRenderer(glContext);
  let session: ISceneSession | null = null;
  let isDestroyed = false;

  const renderFrame = (timeMs: number): boolean => {
    const isAnimating = input.step(timeMs);
    const changedView = camera.takeViewChange();

    if (changedView !== null) {
      emitter.emit('viewChange', { view: changedView });
    }

    const frameCamera = camera.frameCamera();

    if (renderer === null || frameCamera === null) {
      return isAnimating;
    }

    const viewport = camera.getViewport();
    const bufferSize = drawingBufferSize({
      cssWidth: viewport.width,
      cssHeight: viewport.height,
      devicePixelRatio: container.ownerDocument.defaultView?.devicePixelRatio ?? 1,
      maxPixelRatio: resolvedOptions.maxPixelRatio,
      renderScale: resolvedOptions.renderScale,
    });

    if (elements.canvas.width !== bufferSize.width || elements.canvas.height !== bufferSize.height) {
      elements.canvas.width = bufferSize.width;
      elements.canvas.height = bufferSize.height;
    }

    renderer.drawFrame(frameCamera, session?.drawings() ?? [], bufferSize.width, bufferSize.height);

    return isAnimating;
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

  const reportError = (error: IPanoError): void => {
    store.update({ status: EnumViewerStatus.Error, error });
    emitter.emit('error', { error });
  };

  const handleSessionChange = (sceneId: string, state: ISceneSessionState): void => {
    if (isDestroyed) {
      return;
    }

    const previousStatus = store.getSnapshot().status;
    const wasReady = previousStatus === EnumViewerStatus.Ready;
    const status = previousStatus === EnumViewerStatus.Error ? EnumViewerStatus.Error : state.status;

    store.update({ loadProgress: state.loadProgress, status });
    camera.setSourceDensity(state.pixelsPerRadian);
    loop.requestRender();

    if (!wasReady && store.getSnapshot().status === EnumViewerStatus.Ready) {
      emitter.emit('sceneReady', { sceneId });
    }
  };

  const loadSession = async (activeSession: ISceneSession, sceneId: string): Promise<void> => {
    try {
      await activeSession.load();
    } catch (error) {
      if (isDestroyed || isAbortError(error)) {
        return;
      }

      reportError(toPanoError(error, `scene "${sceneId}"`));
      throw error;
    }
  };

  const showScene = (scene: IScene): void => {
    if (glContext === null) {
      return;
    }

    store.update({ sceneId: scene.id, status: EnumViewerStatus.Loading, loadProgress: 0, error: null });
    emitter.emit('sceneLoadStart', { sceneId: scene.id });
    session = createSceneSession({
      scene,
      glContext,
      loadImage: (url, signal) =>
        loadImage(url, { loader: resolvedOptions.loader, retry: resolvedOptions.retry, signal }),
      onChange: (state) => {
        handleSessionChange(scene.id, state);
      },
    });
    loadSession(session, scene.id).catch(() => undefined);
  };

  const start = (): void => {
    if (isDestroyed) {
      return;
    }

    if (glContext === null) {
      reportError(webglUnavailableError());
    } else if (startScene === undefined) {
      reportError(
        createPanoError(EnumErrorCode.InvalidTour, { message: 'The tour is invalid', issues: tourIssues }),
      );
    } else {
      showScene(startScene);
    }

    loop.requestRender();
  };

  const retry = async (): Promise<void> => {
    const { error, sceneId } = store.getSnapshot();

    if (
      isDestroyed ||
      session === null ||
      sceneId === null ||
      error?.category !== EnumErrorCategory.Resource
    ) {
      return;
    }

    store.update({
      status: session.hasVisiblePreview() ? EnumViewerStatus.Preview : EnumViewerStatus.Loading,
      error: null,
    });
    await loadSession(session, sceneId);
  };

  const destroy = (): void => {
    if (isDestroyed) {
      return;
    }

    isDestroyed = true;
    input.dispose();
    session?.dispose();
    loop.dispose();
    stopObservingSize();
    renderer?.dispose();

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
    retry,
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
