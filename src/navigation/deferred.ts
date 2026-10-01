export interface IDeferred<TValue> {
  promise: Promise<TValue>;
  resolve: (value: TValue) => void;
  reject: (error: unknown) => void;
}

/**
 * Промис с внешними `resolve`/`reject`: смена сцены завершается не там, где начата (в кадре конца
 * смешивания, при перебивании или уничтожении). Повторное завершение ничего не делает, как у обычного
 * промиса.
 */
export const createDeferred = <TValue>(): IDeferred<TValue> => {
  const settlers: Pick<IDeferred<TValue>, 'resolve' | 'reject'> = {
    resolve: () => undefined,
    reject: () => undefined,
  };
  const promise = new Promise<TValue>((resolve, reject) => {
    settlers.resolve = resolve;
    settlers.reject = reject;
  });

  return {
    promise,
    resolve: (value) => {
      settlers.resolve(value);
    },
    reject: (error) => {
      settlers.reject(error);
    },
  };
};
