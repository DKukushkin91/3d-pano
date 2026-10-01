import type { IPanoViewer, IPanoViewerEventMap } from '../viewer/viewer-types';

/**
 * Обработчики событий в виде React-пропсов.
 */
export interface IPanoViewerEventProps {
  onSceneLoadStart?: (payload: IPanoViewerEventMap['sceneLoadStart']) => void;
  onSceneReady?: (payload: IPanoViewerEventMap['sceneReady']) => void;
  onViewChange?: (payload: IPanoViewerEventMap['viewChange']) => void;
  onError?: (payload: IPanoViewerEventMap['error']) => void;
}

/**
 * Подписывает просмотрщик на последние переданные обработчики: `readHandlers` читается в момент события,
 * поэтому новая функция в каждом рендере не требует переподписки. Подписка делается сразу после создания
 * просмотрщика, в том же эффекте, — иначе события стартовой сцены ушли бы раньше, чем React дошёл бы до
 * следующего эффекта.
 */
export const subscribeToViewerEvents = (
  viewer: IPanoViewer,
  readHandlers: () => IPanoViewerEventProps,
): (() => void) => {
  const unsubscribers = [
    viewer.on('sceneLoadStart', (payload) => readHandlers().onSceneLoadStart?.(payload)),
    viewer.on('sceneReady', (payload) => readHandlers().onSceneReady?.(payload)),
    viewer.on('viewChange', (payload) => readHandlers().onViewChange?.(payload)),
    viewer.on('error', (payload) => readHandlers().onError?.(payload)),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
  };
};
