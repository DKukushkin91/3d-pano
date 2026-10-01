import { type RefCallback, useEffect, useRef, useState } from 'react';

import type { IPanoViewerSnapshot } from '../state/viewer-state-types';
import { createPanoViewer } from '../viewer/create-pano-viewer';
import type { IPanoViewer, IPanoViewerOptions, TPanoViewerUpdate } from '../viewer/viewer-types';
import { usePanoSnapshot } from './use-pano-snapshot';
import { type IPanoViewerEventProps, subscribeToViewerEvents } from './use-viewer-events';

/**
 * Опции хука: опции просмотрщика и те же обработчики событий, что у компонента.
 */
export interface IUsePanoViewerOptions extends IPanoViewerOptions, IPanoViewerEventProps {}

export interface IUsePanoViewerResult {
  containerRef: RefCallback<HTMLElement>;
  viewer: IPanoViewer | null;
  snapshot: IPanoViewerSnapshot;
}

const updatableOptions = (options: IPanoViewerOptions): TPanoViewerUpdate => ({
  label: options.label,
  loader: options.loader,
  retry: options.retry,
  controls: options.controls,
  maxPixelRatio: options.maxPixelRatio,
  renderScale: options.renderScale,
});

/**
 * Общая часть компонента и хука: создание просмотрщика в эффекте (синхронизация с внешней системой) по
 * контейнеру и туру, подписка на события сразу после создания и передача остальных опций в `update()`
 * после каждого рендера — одинаковые значения он пропускает.
 */
export const useViewerInstance = (
  options: IPanoViewerOptions,
  eventHandlers: IPanoViewerEventProps,
): IUsePanoViewerResult => {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [viewer, setViewer] = useState<IPanoViewer | null>(null);
  const latestOptions = useRef(options);
  const latestHandlers = useRef(eventHandlers);
  const snapshot = usePanoSnapshot(viewer);
  const { tour } = options;

  useEffect(() => {
    latestOptions.current = options;
    latestHandlers.current = eventHandlers;
    viewer?.update(updatableOptions(options));
  });

  useEffect(() => {
    if (container === null) {
      return undefined;
    }

    const createdViewer = createPanoViewer(container, { ...latestOptions.current, tour });
    const unsubscribe = subscribeToViewerEvents(createdViewer, () => latestHandlers.current);

    setViewer(createdViewer);

    return () => {
      unsubscribe();
      createdViewer.destroy();
      setViewer(null);
    };
  }, [container, tour]);

  return { containerRef: setContainer, viewer, snapshot };
};

/**
 * Просмотрщик в контейнере хоста со своей разметкой. Смена тура пересоздаёт просмотрщик; `controls` и
 * `retry` можно писать прямо в JSX. Обработчики событий подписываются сразу после создания, поэтому
 * события стартовой сцены не теряются. Контейнер — callback-реф: условный рендер и замена DOM-узла
 * пересоздают просмотрщик.
 */
export const usePanoViewer = ({
  onSceneLoadStart,
  onSceneReady,
  onViewChange,
  onError,
  ...options
}: IUsePanoViewerOptions): IUsePanoViewerResult =>
  useViewerInstance(options, { onSceneLoadStart, onSceneReady, onViewChange, onError });
