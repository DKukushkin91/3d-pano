import { type RefCallback, useEffect, useRef, useState } from 'react';

import type { IPanoViewerSnapshot } from '../state/viewer-state-types';
import { createPanoViewer } from '../viewer/create-pano-viewer';
import type { IPanoViewer, IPanoViewerOptions, TPanoViewerUpdate } from '../viewer/viewer-types';
import { usePanoSnapshot } from './use-pano-snapshot';
import { type IPanoViewerSceneProps, tourWithStartScene, useSceneSync } from './use-scene-sync';
import { type IPanoViewerEventProps, subscribeToViewerEvents } from './use-viewer-events';

/**
 * Опции хука: опции просмотрщика, пропсы сцены и те же обработчики событий, что у компонента.
 */
export interface IUsePanoViewerOptions
  extends IPanoViewerOptions, IPanoViewerSceneProps, IPanoViewerEventProps {}

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
  sceneCacheMegabytes: options.sceneCacheMegabytes,
});

/**
 * Общая часть компонента и хука: создание просмотрщика в эффекте (синхронизация с внешней системой) по
 * контейнеру, подписка на события сразу после создания, передача опций в `update()` после каждого рендера
 * (одинаковые значения он пропускает) и применение `scene` и `tour` без пересоздания.
 */
export const useViewerInstance = (
  options: IPanoViewerOptions,
  sceneProps: IPanoViewerSceneProps,
  eventHandlers: IPanoViewerEventProps,
): IUsePanoViewerResult => {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [viewer, setViewer] = useState<IPanoViewer | null>(null);
  const latestOptions = useRef(options);
  const latestScene = useRef(sceneProps.scene);
  const latestHandlers = useRef(eventHandlers);
  const snapshot = usePanoSnapshot(viewer);

  useEffect(() => {
    latestOptions.current = options;
    latestScene.current = sceneProps.scene;
    latestHandlers.current = eventHandlers;
    viewer?.update(updatableOptions(options));
  });

  useEffect(() => {
    if (container === null) {
      return undefined;
    }

    const { tour } = latestOptions.current;
    const createdViewer = createPanoViewer(container, {
      ...latestOptions.current,
      tour: tourWithStartScene(tour, latestScene.current),
    });
    const unsubscribe = subscribeToViewerEvents(createdViewer, () => latestHandlers.current);

    setViewer(createdViewer);

    return () => {
      unsubscribe();
      createdViewer.destroy();
      setViewer(null);
    };
  }, [container]);

  useSceneSync(viewer, options.tour, sceneProps, () => latestHandlers.current.onError);

  return { containerRef: setContainer, viewer, snapshot };
};

/**
 * Просмотрщик в контейнере хоста со своей разметкой. Смена `tour` по содержимому вызывает `setTour`, смена
 * `scene` — `showScene` с `sceneOptions` того же рендера; просмотрщик пересоздаётся только при замене
 * DOM-узла контейнера. `controls` и `retry` можно писать прямо в JSX. Обработчики событий подписываются
 * сразу после создания, поэтому события стартовой сцены не теряются.
 */
export const usePanoViewer = ({
  scene,
  sceneOptions,
  onSceneLoadStart,
  onSceneReady,
  onSceneChange,
  onViewChange,
  onError,
  ...options
}: IUsePanoViewerOptions): IUsePanoViewerResult =>
  useViewerInstance(
    options,
    { scene, sceneOptions },
    { onSceneLoadStart, onSceneReady, onSceneChange, onViewChange, onError },
  );
