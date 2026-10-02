/**
 * Запись таблицы сопоставления, которую ведёт сцена: номер записи, слой пула и непрозрачность.
 */
export interface ITileTableWriter {
  set: (index: number, slot: number | null, opacity: number) => void;
}

/**
 * Тайлы сцены, лежащие в пуле, и их проявление. Тайл, загруженный после готовности, появляется с
 * непрозрачностью 0 и набирает её за `fadeMs` с первого кадра, в котором его рисуют; остальные видны сразу.
 */
export interface ITileResidency {
  place: (url: string, index: number, slot: number, shouldFade: boolean) => void;
  remove: (url: string) => void;
  clear: () => void;
  isResident: (url: string) => boolean;
  step: (timeMs: number, fadeMs: number) => boolean;
}

interface IResidentTile {
  index: number;
  slot: number;
  startMs: number | null;
}

export const createTileResidency = (table: ITileTableWriter): ITileResidency => {
  const resident = new Map<string, IResidentTile>();
  const fading = new Set<string>();

  const remove = (url: string): void => {
    const tile = resident.get(url);

    if (tile !== undefined) {
      table.set(tile.index, null, 0);
      resident.delete(url);
      fading.delete(url);
    }
  };

  const step = (timeMs: number, fadeMs: number): boolean => {
    for (const url of fading) {
      const tile = resident.get(url);

      if (tile === undefined) {
        fading.delete(url);
        continue;
      }

      tile.startMs ??= timeMs;

      const opacity = fadeMs <= 0 ? 1 : Math.min(1, (timeMs - tile.startMs) / fadeMs);

      table.set(tile.index, tile.slot, opacity);

      if (opacity >= 1) {
        fading.delete(url);
      }
    }

    return fading.size > 0;
  };

  return {
    place: (url, index, slot, shouldFade) => {
      resident.set(url, { index, slot, startMs: null });
      table.set(index, slot, shouldFade ? 0 : 1);

      if (shouldFade) {
        fading.add(url);
      } else {
        fading.delete(url);
      }
    },
    remove,
    clear: () => {
      for (const url of resident.keys()) {
        remove(url);
      }
    },
    isResident: (url) => resident.has(url),
    step,
  };
};
