import {
  type ForwardRefExoticComponent,
  type ReactNode,
  type RefAttributes,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { createPortal } from 'react-dom';

import type { IPanoViewer, IPanoViewerOptions } from '../viewer/viewer-types';
import { PanoViewerContext } from './hotspot-context';
import { type TRenderHotspotNode, useHotspotPortals } from './use-hotspot-portals';
import { useViewerInstance } from './use-pano-viewer';
import type { IPanoViewerSceneProps } from './use-scene-sync';
import type { IPanoViewerEventProps } from './use-viewer-events';

export interface IPanoViewerProps
  extends Omit<IPanoViewerOptions, 'renderHotspot'>, IPanoViewerSceneProps, IPanoViewerEventProps {
  className?: string;
  children?: ReactNode;
  renderHotspot?: TRenderHotspotNode;
}

/**
 * Панорама в контейнере с `className`. Дети рендерятся порталом в оверлей поверх панорамы после
 * монтирования: на сервере и в первом клиентском рендере разметка — один пустой `div`, поэтому гидратация
 * не расходится. `ref` получает экземпляр просмотрщика (`null` до монтирования); `forwardRef` — чтобы `ref`
 * работал и в React 18. `scene` применяется при изменении значения: смена сцены через `ref` не
 * откатывается, о ней сообщает `onSceneChange`.
 */
export const PanoViewer: ForwardRefExoticComponent<IPanoViewerProps & RefAttributes<IPanoViewer | null>> =
  forwardRef<IPanoViewer | null, IPanoViewerProps>(
    (
      {
        className,
        children,
        scene,
        sceneOptions,
        renderHotspot,
        onSceneLoadStart,
        onSceneReady,
        onSceneChange,
        onViewChange,
        onError,
        onHotspotClick,
        onHotspotEnter,
        onHotspotLeave,
        ...options
      },
      ref,
    ) => {
      const portals = useHotspotPortals(renderHotspot);
      const { containerRef, viewer } = useViewerInstance(
        { ...options, renderHotspot: portals.renderHotspot },
        { scene, sceneOptions },
        {
          onSceneLoadStart,
          onSceneReady,
          onSceneChange,
          onViewChange,
          onError,
          onHotspotClick,
          onHotspotEnter,
          onHotspotLeave,
        },
      );

      useImperativeHandle<IPanoViewer | null, IPanoViewer | null>(ref, () => viewer, [viewer]);

      return (
        <div ref={containerRef} className={className}>
          <PanoViewerContext.Provider value={viewer}>
            {viewer !== null && children !== undefined && createPortal(children, viewer.overlay)}
            {portals.hotspotPortals}
          </PanoViewerContext.Provider>
        </div>
      );
    },
  );

PanoViewer.displayName = 'PanoViewer';
