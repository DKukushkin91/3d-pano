/**
 * Запись поверхности для выбора кадра: сцена хотспота (`null` — хотспот хоста без сцены) и признак
 * «уходящей» записи — хотспот уже убран, но его сцена ещё может гаснуть в переходе.
 */
export interface IFrameSurfaceEntry {
  scene: string | null;
  isLeaving: boolean;
}

/**
 * Сцены в кадре навигатора: текущая и, во время смешивания или шага, предыдущая.
 */
export interface ISurfaceFrameScenes {
  current: string | null;
  previous: string | null;
}

/**
 * Поверхности кадра: с текущей сценой, с предыдущей и уходящие записи, которые больше не рисуются и
 * освобождаются.
 */
export interface ISurfaceFrameSets<TEntry> {
  current: TEntry[];
  previous: TEntry[];
  finished: TEntry[];
}

const isDrawnWith = (entry: IFrameSurfaceEntry, sceneId: string | null, canBeLeaving: boolean): boolean => {
  if (sceneId === null) {
    return false;
  }

  if (entry.scene === null) {
    return !entry.isLeaving;
  }

  return entry.scene === sceneId && (canBeLeaving || !entry.isLeaving);
};

/**
 * Поверхности рисуются вместе с изображением своей сцены. Записи хотспотов сцены — с этой сценой, записи
 * хоста без сцены — с обеими, чтобы при смене ремонта не было провала яркости. Уходящие записи (хотспоты
 * тура, убранные в момент появления новой сцены) рисуются только с предыдущей сценой — гаснут вместе с
 * ней; когда их сцена больше не предыдущая, переход закончился и они освобождаются.
 */
export const surfacesOfFrame = <TEntry extends IFrameSurfaceEntry>(
  entries: readonly TEntry[],
  scenes: ISurfaceFrameScenes,
): ISurfaceFrameSets<TEntry> => ({
  current: entries.filter((entry) => isDrawnWith(entry, scenes.current, false)),
  previous: entries.filter((entry) => isDrawnWith(entry, scenes.previous, true)),
  finished: entries.filter(
    (entry) => entry.isLeaving && (entry.scene === null || entry.scene !== scenes.previous),
  ),
});
