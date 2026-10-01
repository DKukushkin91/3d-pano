const BYTES_PER_MEGABYTE = 2 ** 20;

/**
 * Кэш подготовленных сцен. `get` отмечает запись как недавно использованную; `add` возвращает, удержана
 * ли запись; `protect` задаёт ключи, которые нельзя вытеснять (сцена на экране и переходная).
 */
export interface ISceneCache<TValue> {
  get: (key: string) => TValue | undefined;
  add: (key: string, value: TValue, bytes: number) => boolean;
  protect: (keys: readonly string[]) => void;
  setBudget: (megabytes: number) => void;
  remove: (key: string) => void;
  totalBytes: () => number;
  clear: () => void;
}

interface ICacheEntry<TValue> {
  value: TValue;
  bytes: number;
}

/**
 * LRU по оценке байтов видеопамяти. Защищённые записи входят в бюджет, но не вытесняются: если только
 * они его и превышают, кэш держит их одни. Запись, которая не влезает даже после вытеснения остальных,
 * не удерживается — её `dispose` вызывается сразу.
 */
export const createSceneCache = <TValue>(
  budgetMegabytes: number,
  dispose: (value: TValue) => void,
): ISceneCache<TValue> => {
  const entries = new Map<string, ICacheEntry<TValue>>();
  let protectedKeys: ReadonlySet<string> = new Set();
  let budgetBytes = budgetMegabytes * BYTES_PER_MEGABYTE;

  const totalBytes = (): number => Array.from(entries.values()).reduce((sum, entry) => sum + entry.bytes, 0);

  const remove = (key: string): void => {
    const entry = entries.get(key);

    if (entry === undefined) {
      return;
    }

    entries.delete(key);
    dispose(entry.value);
  };

  const evictLeastRecent = (keepKey: string | null): void => {
    const evictable = Array.from(entries.keys()).filter((key) => key !== keepKey && !protectedKeys.has(key));

    for (const key of evictable) {
      if (totalBytes() <= budgetBytes) {
        return;
      }

      remove(key);
    }
  };

  const get = (key: string): TValue | undefined => {
    const entry = entries.get(key);

    if (entry !== undefined) {
      entries.delete(key);
      entries.set(key, entry);
    }

    return entry?.value;
  };

  const protectedBytesExcept = (key: string): number =>
    Array.from(entries.entries())
      .filter(([entryKey]) => entryKey !== key && protectedKeys.has(entryKey))
      .reduce((sum, [, entry]) => sum + entry.bytes, 0);

  const add = (key: string, value: TValue, bytes: number): boolean => {
    if (entries.get(key)?.value !== value) {
      remove(key);
    }

    if (!protectedKeys.has(key) && protectedBytesExcept(key) + bytes > budgetBytes) {
      entries.delete(key);
      dispose(value);

      return false;
    }

    entries.delete(key);
    entries.set(key, { value, bytes });
    evictLeastRecent(key);

    return true;
  };

  return {
    get,
    add,
    protect: (keys) => {
      protectedKeys = new Set(keys);
      evictLeastRecent(null);
    },
    setBudget: (megabytes) => {
      budgetBytes = megabytes * BYTES_PER_MEGABYTE;
      evictLeastRecent(null);
    },
    remove,
    totalBytes,
    clear: () => {
      for (const key of Array.from(entries.keys())) {
        remove(key);
      }
    },
  };
};
