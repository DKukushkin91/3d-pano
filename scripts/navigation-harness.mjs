import {
  EnumErrorCode,
  PanoLoadError,
  createEventEmitter,
  createPanoError,
  createSceneNavigator,
  createSnapshotStore,
} from '../dist/internal.js';

export const MEGABYTE = 2 ** 20;
export const SCENE_BYTES = 100 * MEGABYTE;
export const READY_DENSITY = 1000;
export const EVENT_NAMES = ['sceneChange', 'sceneLoadStart', 'sceneReady', 'error'];

const equirect = (name) => ({ type: 'equirect', url: `https://cdn.example.com/${name}.jpg` });

export const TOUR = {
  defaults: { limits: { fov: [40, 110] } },
  scenes: [
    { id: 'kitchen', source: equirect('kitchen'), preview: equirect('kitchen-preview'), view: { yaw: 10 } },
    { id: 'bedroom', source: equirect('bedroom'), view: { yaw: 30, fov: 80 } },
    { id: 'hall', source: equirect('hall') },
    { id: 'bath', source: equirect('bath') },
  ],
};

export const flush = () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

export const networkFailure = (url) =>
  new PanoLoadError(createPanoError(EnumErrorCode.NetworkFailed, { message: 'offline', url }));

export const notFound = (url) =>
  new PanoLoadError(createPanoError(EnumErrorCode.HttpStatus, { message: 'http', url, httpStatus: 404 }));

const createFakeSession = (scene, withPreview, onChange) => {
  const session = {
    scene,
    withPreview,
    loads: 0,
    isDisposed: false,
    settleLoad: null,
    load: () => {
      session.loads += 1;

      return new Promise((resolve, reject) => {
        session.settleLoad = { resolve, reject };
      });
    },
    byteSize: () => SCENE_BYTES,
    dispose: () => {
      session.isDisposed = true;
    },
    progress: (loadProgress) => {
      onChange({ status: 'loading', loadProgress, pixelsPerRadian: null });
    },
    complete: () => {
      onChange({ status: 'ready', loadProgress: 1, pixelsPerRadian: READY_DENSITY });
      session.settleLoad?.resolve();
    },
    fail: (error) => {
      session.settleLoad?.reject(error);
    },
  };

  return session;
};

/**
 * Стенд навигатора: поддельные сессии, камера-заглушка и журнал событий. Загрузки завершаются вручную
 * через `complete(sceneId)` и `fail(sceneId, error)`.
 */
export const createHarness = ({ cacheMegabytes = 256 } = {}) => {
  const store = createSnapshotStore();
  const emitter = createEventEmitter();
  const sessions = [];
  const events = [];
  const appearances = [];
  const appliedLimits = [];
  const refreshes = [];
  const densities = [];
  const camera = { view: { yaw: 0, pitch: 0, roll: 0, fov: 90, fovMode: 'max' } };

  for (const name of EVENT_NAMES) {
    emitter.on(name, (payload) => {
      events.push({ name, ...payload });
    });
  }

  const host = {
    createSession: (scene, withPreview, onChange) => {
      const session = createFakeSession(scene, withPreview, onChange);

      sessions.push(session);

      return session;
    },
    getView: () => ({ ...camera.view }),
    present: (appearance) => {
      appearances.push(appearance);
      camera.view = appearance.view;
    },
    refreshScene: (refresh) => {
      refreshes.push(refresh);
      appliedLimits.push(refresh.limits);
    },
    setSourceDensity: (pixelsPerRadian) => {
      densities.push(pixelsPerRadian);
    },
    requestFrame: () => undefined,
    store,
    emitter,
  };
  const navigator = createSceneNavigator(host, cacheMegabytes);

  const sessionsOf = (sceneId) => sessions.filter((session) => session.scene.id === sceneId);
  const latestSession = (sceneId) => sessionsOf(sceneId).at(-1);

  const complete = async (sceneId) => {
    latestSession(sceneId).complete();
    await flush();
  };

  const fail = async (sceneId, error) => {
    latestSession(sceneId).fail(error);
    await flush();
  };

  const startAt = async (sceneId = 'kitchen') => {
    const shown = navigator.setTour(TOUR, { scene: sceneId });

    await complete(sceneId);
    await shown;
    events.length = 0;
  };

  return {
    navigator,
    store,
    camera,
    sessions,
    events,
    appearances,
    appliedLimits,
    refreshes,
    densities,
    sessionsOf,
    latestSession,
    complete,
    fail,
    startAt,
    snapshot: () => store.getSnapshot(),
    eventNames: () => events.map((event) => event.name),
  };
};
