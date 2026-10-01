import type { IPanoViewer, ITour } from '@dkukushkin/3d-pano';
import type { ReactElement } from 'react';

/**
 * Значения, которые примеры документации получают от хоста: их объявление в каждом примере только
 * загромоздило бы текст. Всё, что относится к библиотеке, примеры импортируют сами.
 */
declare global {
  const container: HTMLElement;
  const tour: ITour;
  const token: string;
  const marker: HTMLElement;
  const viewer: IPanoViewer;
  const analytics: { track: (event: string, properties: Record<string, unknown>) => void };
  const handleSceneReady: (payload: { sceneId: string }) => void;
  const LoadingBar: (props: { viewer: IPanoViewer | null }) => ReactElement | null;
  const YourOverlayUi: () => ReactElement;
}
