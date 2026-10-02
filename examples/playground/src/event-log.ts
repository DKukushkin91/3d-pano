import type { IPanoViewer } from '@dkukushkin/3d-pano';

const MAX_EVENTS = 40;

/**
 * Журнал событий песочницы: последние события сверху, текст — через `textContent`.
 */
export const createEventLog =
  (list: HTMLOListElement): ((message: string) => void) =>
  (message) => {
    const item = document.createElement('li');

    item.textContent = `${new Date().toLocaleTimeString()} ${message}`;
    list.prepend(item);

    while (list.children.length > MAX_EVENTS) {
      list.lastElementChild?.remove();
    }
  };

/**
 * Пишет в журнал события просмотрщика: смену сцен, загрузку, ошибки и хотспоты. `shouldPreventNavigation`
 * отменяет переход по хотспоту — так проверяется `preventDefault()`.
 */
export const attachViewerLogging = (
  target: IPanoViewer,
  name: string,
  logEvent: (text: string) => void,
  shouldPreventNavigation: () => boolean,
): void => {
  target.on('sceneChange', ({ sceneId, previousSceneId }) => {
    logEvent(`${name} sceneChange ${previousSceneId ?? '—'} → ${sceneId}`);
  });
  target.on('sceneLoadStart', ({ sceneId }) => {
    logEvent(`${name} sceneLoadStart ${sceneId}`);
  });
  target.on('sceneReady', ({ sceneId }) => {
    logEvent(`${name} sceneReady ${sceneId}`);
  });
  target.on('error', ({ error }) => {
    logEvent(`${name} error ${error.category}/${error.code} ${error.url ?? ''}`);
  });
  target.on('hotspotClick', ({ sceneId, hotspot, preventDefault }) => {
    const isPrevented = shouldPreventNavigation();

    if (isPrevented) {
      preventDefault();
    }

    logEvent(`${name} hotspotClick ${sceneId}/${hotspot.id}${isPrevented ? ' (prevented)' : ''}`);
  });
  target.on('hotspotEnter', ({ sceneId, hotspot }) => {
    logEvent(`${name} hotspotEnter ${sceneId}/${hotspot.id}`);
  });
  target.on('hotspotLeave', ({ sceneId, hotspot }) => {
    logEvent(`${name} hotspotLeave ${sceneId}/${hotspot.id}`);
  });
};

/**
 * Пишет в журнал, чем закончился вызов с промисом: `true`/`false` или отказ с `details` ошибки.
 */
export const logOutcome = (
  logEvent: (text: string) => void,
  action: string,
  promise: Promise<boolean>,
): void => {
  promise.then(
    (isDone) => {
      logEvent(`${action} → ${String(isDone)}`);
    },
    (error: unknown) => {
      const code =
        error instanceof Error && 'details' in error ? JSON.stringify(error.details) : String(error);

      logEvent(`${action} rejected ${code}`);
    },
  );
};
