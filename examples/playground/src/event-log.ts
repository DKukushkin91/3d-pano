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
