import { callHostSafely } from './report-error';
import { EnumViewerStatus } from './viewer-dictionaries';
import type { IPanoViewerSnapshot } from './viewer-state-types';

/**
 * Снимок до загрузки первой сцены. Его же возвращает React-хук для ещё не созданного просмотрщика.
 */
export const INITIAL_SNAPSHOT: Readonly<IPanoViewerSnapshot> = Object.freeze({
  sceneId: null,
  status: EnumViewerStatus.Loading,
  loadProgress: 0,
  isInteracting: false,
  error: null,
});

export interface ISnapshotStore {
  getSnapshot: () => IPanoViewerSnapshot;
  subscribe: (listener: () => void) => () => void;
  update: (changes: Partial<IPanoViewerSnapshot>) => void;
  clear: () => void;
}

const SNAPSHOT_KEYS: readonly (keyof IPanoViewerSnapshot)[] = [
  'sceneId',
  'status',
  'loadProgress',
  'isInteracting',
  'error',
];

const hasChanges = (snapshot: IPanoViewerSnapshot, changes: Partial<IPanoViewerSnapshot>): boolean =>
  SNAPSHOT_KEYS.some((key) => key in changes && !Object.is(snapshot[key], changes[key]));

/**
 * Новый замороженный объект создаётся только при реальном изменении — `useSyncExternalStore` сравнивает
 * снимки по ссылке. `getSnapshot` и `subscribe` не используют `this` и передаются как обычные функции.
 */
export const createSnapshotStore = (): ISnapshotStore => {
  let snapshot: IPanoViewerSnapshot = INITIAL_SNAPSHOT;
  const listeners = new Set<() => void>();

  const getSnapshot = (): IPanoViewerSnapshot => snapshot;

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  };

  const update = (changes: Partial<IPanoViewerSnapshot>): void => {
    if (!hasChanges(snapshot, changes)) {
      return;
    }

    snapshot = Object.freeze({ ...snapshot, ...changes });

    for (const listener of Array.from(listeners)) {
      callHostSafely(listener);
    }
  };

  const clear = (): void => {
    listeners.clear();
  };

  return { getSnapshot, subscribe, update, clear };
};
