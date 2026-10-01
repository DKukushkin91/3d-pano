import { useSyncExternalStore } from 'react';

import { INITIAL_SNAPSHOT } from '../state/snapshot-store';
import type { IPanoViewerSnapshot } from '../state/viewer-state-types';
import type { IPanoViewer } from '../viewer/viewer-types';

const subscribeToNothing = (): (() => void) => () => undefined;

const readInitialSnapshot = (): IPanoViewerSnapshot => INITIAL_SNAPSHOT;

/**
 * Снимок состояния просмотрщика для React. Компонент перерисовывается только при смене снимка — не при
 * вращении панорамы. Для ещё не созданного просмотрщика (`null`) и на сервере возвращается начальный
 * снимок со статусом `loading`.
 */
export const usePanoSnapshot = (viewer: IPanoViewer | null): IPanoViewerSnapshot =>
  useSyncExternalStore(
    viewer?.subscribe ?? subscribeToNothing,
    viewer?.getSnapshot ?? readInitialSnapshot,
    readInitialSnapshot,
  );
