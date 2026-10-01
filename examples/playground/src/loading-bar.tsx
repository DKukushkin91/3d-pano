import { type IPanoViewer, usePanoSnapshot } from '@dkukushkin/3d-pano/react';
import { type CSSProperties, type ReactElement, useMemo } from 'react';

interface ILoadingBarProps {
  viewer: IPanoViewer | null;
}

/**
 * Полоса загрузки в оверлее поверх панорамы. Ширина — runtime-значение `loadProgress`, классом не
 * выражается, поэтому это единственный инлайн-стиль; компонент не перерисовывается при вращении.
 */
export const LoadingBar = ({ viewer }: ILoadingBarProps): ReactElement | null => {
  const { loadProgress, status } = usePanoSnapshot(viewer);
  const barStyle = useMemo<CSSProperties>(
    () => ({ width: `${String(loadProgress * 100)}%` }),
    [loadProgress],
  );

  if (status === 'ready') {
    return null;
  }

  return <div className="loading-bar" style={barStyle} data-loading-bar />;
};
