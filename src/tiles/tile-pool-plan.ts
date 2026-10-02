const BYTES_PER_TEXEL = 4;
const BYTES_PER_MEGABYTE = 2 ** 20;

/**
 * Сколько тайлов держит пул: бюджет делится на размер тайла без MIP (`tileSize² · 4` байт) и не
 * превышает лимит слоёв текстуры-массива устройства.
 */
export const tilePoolCapacity = (budgetMegabytes: number, tileSize: number, maxLayers: number): number =>
  Math.max(
    0,
    Math.min(
      Math.floor((budgetMegabytes * BYTES_PER_MEGABYTE) / (tileSize * tileSize * BYTES_PER_TEXEL)),
      maxLayers,
    ),
  );

/**
 * Тайлы, которые кадр может держать в пуле: списки сцен на экране идут по приоритету (текущая, затем
 * предыдущая при смешивании), внутри — от грубого уровня к подробному и от центра. Не влезшие отбрасываются
 * с конца — это самые подробные и дальние, и там кадр остаётся на уровне грубее.
 */
export const fitFrameTiles = <TTile>(lists: readonly (readonly TTile[])[], capacity: number): TTile[][] => {
  let left = capacity;

  return lists.map((tiles) => {
    const kept = tiles.slice(0, Math.max(0, left));

    left -= kept.length;

    return kept;
  });
};

/**
 * Место тайла в пуле и тайл, которого ради него вытеснили.
 */
export interface ITilePlacement {
  slot: number;
  evicted: string | null;
}

/**
 * Слоты пула по URL тайла: сцены с тем же источником и новый тур с теми же файлами находят тайл на месте.
 * Вытесняется тайл, который дольше всех не рисовался (новый считается рисованным в кадре размещения), но
 * никогда не защищённый — тайл текущего кадра.
 */
export interface ITileSlots {
  capacity: number;
  slotOf: (url: string) => number | undefined;
  touch: (url: string, frameNumber: number) => void;
  place: (url: string, protectedUrls: ReadonlySet<string>, frameNumber: number) => ITilePlacement | null;
  remove: (url: string) => void;
  size: () => number;
}

interface ISlotEntry {
  slot: number;
  lastFrame: number;
}

export const createTileSlots = (capacity: number): ITileSlots => {
  const entries = new Map<string, ISlotEntry>();
  const freeSlots = Array.from({ length: capacity }, (_unused, slot) => capacity - 1 - slot);

  const leastRecent = (protectedUrls: ReadonlySet<string>): string | null => {
    let found: string | null = null;
    let foundFrame = Number.POSITIVE_INFINITY;

    for (const [url, entry] of entries) {
      if (!protectedUrls.has(url) && entry.lastFrame < foundFrame) {
        found = url;
        foundFrame = entry.lastFrame;
      }
    }

    return found;
  };

  const place = (
    url: string,
    protectedUrls: ReadonlySet<string>,
    frameNumber: number,
  ): ITilePlacement | null => {
    const known = entries.get(url);

    if (known !== undefined) {
      return { slot: known.slot, evicted: null };
    }

    const take = (slot: number, evicted: string | null): ITilePlacement => {
      entries.set(url, { slot, lastFrame: frameNumber });

      return { slot, evicted };
    };
    const freeSlot = freeSlots.pop();

    if (freeSlot !== undefined) {
      return take(freeSlot, null);
    }

    const evicted = leastRecent(protectedUrls);
    const evictedEntry = evicted === null ? undefined : entries.get(evicted);

    if (evicted === null || evictedEntry === undefined) {
      return null;
    }

    entries.delete(evicted);

    return take(evictedEntry.slot, evicted);
  };

  return {
    capacity,
    slotOf: (url) => entries.get(url)?.slot,
    touch: (url, frameNumber) => {
      const entry = entries.get(url);

      if (entry !== undefined) {
        entry.lastFrame = frameNumber;
      }
    },
    place,
    remove: (url) => {
      const entry = entries.get(url);

      if (entry !== undefined) {
        entries.delete(url);
        freeSlots.push(entry.slot);
      }
    },
    size: () => entries.size,
  };
};
