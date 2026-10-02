/**
 * Размер источника поверхности в пикселях.
 */
export interface ISurfaceSize {
  width: number;
  height: number;
}

/**
 * Побочные эффекты хранилища: заливка источника в текстуру (`previous` — та же текстура для перезаливки),
 * освобождение текстуры, размер источника, лимит текстуры устройства и сигнал «нужен новый кадр».
 */
export interface ISurfaceStoreEffects<TImage, TTexture> {
  upload: (image: TImage, previous: TTexture | null) => TTexture;
  release: (texture: TTexture) => void;
  sizeOf: (image: TImage) => ISurfaceSize;
  maxTextureSize: number;
  onChange: () => void;
}

/**
 * Залитый источник: текстура, размер, по которому считается высота поверхности, и сам источник — по нему
 * видео сообщает о новых кадрах.
 */
export interface IStoredSurface<TImage, TTexture> {
  texture: TTexture;
  size: ISurfaceSize;
  image: TImage;
}

/**
 * Ссылка хотспота на источник. `current` — `null`, пока источник грузится или не загрузился; `refresh`
 * заливает уже полученный источник заново (перерисованный `<canvas>`, новый кадр видео); `release`
 * отдаёт ссылку, повторный вызов ничего не делает.
 */
export interface ISurfaceSourceHandle<TImage, TTexture> {
  current: () => IStoredSurface<TImage, TTexture> | null;
  refresh: () => void;
  release: () => void;
}

/**
 * Получение источника. Сигнал живёт, пока на источник есть ссылки, и отменяется при освобождении или
 * сбое — по нему загрузка прерывается, а созданное ею (например, `<video>` тура) освобождается.
 */
export type TSurfaceLoad<TImage> = (signal: AbortSignal) => Promise<TImage>;

export interface ISurfaceStore<TImage, TTexture> {
  acquire: (key: unknown, load: TSurfaceLoad<TImage>) => ISurfaceSourceHandle<TImage, TTexture>;
  count: () => number;
  dispose: () => void;
}

interface IEntry<TImage, TTexture> {
  key: unknown;
  references: number;
  controller: AbortController | null;
  image: TImage | null;
  stored: IStoredSurface<TImage, TTexture> | null;
}

/**
 * Хранилище источников поверхностей. Один ключ (URL или объект-источник) — одна загрузка и одна текстура
 * на все хотспоты просмотрщика, пока на него есть ссылки. Сбой загрузки молчаливый: поверхность просто не
 * рисуется, а следующий `acquire` того же ключа пробует снова. Источник со стороной больше
 * `maxTextureSize` считается сбоем. Побочные эффекты передаются снаружи, поэтому учёт проверяется в Node.
 */
export const createSurfaceStore = <TImage, TTexture>(
  effects: ISurfaceStoreEffects<TImage, TTexture>,
): ISurfaceStore<TImage, TTexture> => {
  const entries = new Map<unknown, IEntry<TImage, TTexture>>();

  const releaseTexture = (entry: IEntry<TImage, TTexture>): void => {
    if (entry.stored !== null) {
      effects.release(entry.stored.texture);
      entry.stored = null;
    }
  };

  const fitsTexture = (size: ISurfaceSize): boolean =>
    size.width > 0 &&
    size.height > 0 &&
    size.width <= effects.maxTextureSize &&
    size.height <= effects.maxTextureSize;

  const upload = (entry: IEntry<TImage, TTexture>, image: TImage): void => {
    const size = effects.sizeOf(image);

    if (!fitsTexture(size)) {
      releaseTexture(entry);
      effects.onChange();

      return;
    }

    entry.stored = { texture: effects.upload(image, entry.stored?.texture ?? null), size, image };
    effects.onChange();
  };

  const fail = (entry: IEntry<TImage, TTexture>, controller: AbortController): void => {
    controller.abort();
    entry.controller = null;
  };

  const start = (entry: IEntry<TImage, TTexture>, load: TSurfaceLoad<TImage>): void => {
    const controller = new AbortController();

    entry.controller = controller;
    Promise.resolve()
      .then(() => load(controller.signal))
      .then(
        (image) => {
          if (!controller.signal.aborted) {
            entry.image = image;
            upload(entry, image);
          }
        },
        () => {
          if (!controller.signal.aborted) {
            fail(entry, controller);
          }
        },
      );
  };

  const releaseReference = (entry: IEntry<TImage, TTexture>): void => {
    entry.references -= 1;

    if (entry.references > 0) {
      return;
    }

    entry.controller?.abort();
    releaseTexture(entry);
    entries.delete(entry.key);
  };

  const acquire = (key: unknown, load: TSurfaceLoad<TImage>): ISurfaceSourceHandle<TImage, TTexture> => {
    const entry = entries.get(key) ?? { key, references: 0, controller: null, image: null, stored: null };
    let isReleased = false;

    entries.set(key, entry);
    entry.references += 1;

    if (entry.controller === null) {
      start(entry, load);
    }

    return {
      current: () => (isReleased ? null : entry.stored),
      refresh: () => {
        if (!isReleased && entry.image !== null) {
          upload(entry, entry.image);
        }
      },
      release: () => {
        if (!isReleased) {
          isReleased = true;
          releaseReference(entry);
        }
      },
    };
  };

  return {
    acquire,
    count: () => entries.size,
    dispose: () => {
      for (const entry of entries.values()) {
        entry.controller?.abort();
        releaseTexture(entry);
      }

      entries.clear();
    },
  };
};
