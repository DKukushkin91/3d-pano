import {
  type ForwardRefExoticComponent,
  type ReactNode,
  type RefAttributes,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { createPortal } from 'react-dom';

import type { IPanoViewer, IPanoViewerOptions } from '../viewer/viewer-types';
import { useViewerInstance } from './use-pano-viewer';
import type { IPanoViewerEventProps } from './use-viewer-events';

export interface IPanoViewerProps extends IPanoViewerOptions, IPanoViewerEventProps {
  className?: string;
  children?: ReactNode;
}

/**
 * Панорама в контейнере с `className`. Дети рендерятся порталом в оверлей поверх панорамы после
 * монтирования: на сервере и в первом клиентском рендере разметка — один пустой `div`, поэтому гидратация
 * не расходится. `ref` получает экземпляр просмотрщика (`null` до монтирования); `forwardRef` — чтобы `ref`
 * работал и в React 18.
 */
export const PanoViewer: ForwardRefExoticComponent<IPanoViewerProps & RefAttributes<IPanoViewer | null>> =
  forwardRef<IPanoViewer | null, IPanoViewerProps>(
    ({ className, children, onSceneLoadStart, onSceneReady, onViewChange, onError, ...options }, ref) => {
      const { containerRef, viewer } = useViewerInstance(options, {
        onSceneLoadStart,
        onSceneReady,
        onViewChange,
        onError,
      });

      useImperativeHandle<IPanoViewer | null, IPanoViewer | null>(ref, () => viewer, [viewer]);

      return (
        <div ref={containerRef} className={className}>
          {viewer !== null && children !== undefined && createPortal(children, viewer.overlay)}
        </div>
      );
    },
  );

PanoViewer.displayName = 'PanoViewer';
