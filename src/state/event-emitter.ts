import { callHostSafely } from './report-error';

/**
 * Типизированный эмиттер для карты событий `TEventMap` (имя → данные события).
 */
export interface IEventEmitter<TEventMap extends object> {
  on: <TName extends keyof TEventMap>(
    name: TName,
    handler: (payload: TEventMap[TName]) => void,
  ) => () => void;
  emit: <TName extends keyof TEventMap>(name: TName, payload: TEventMap[TName]) => void;
  clear: () => void;
}

type THandlerSets<TEventMap extends object> = {
  [TName in keyof TEventMap]?: Set<(payload: TEventMap[TName]) => void>;
};

/**
 * Обработчики вызываются по копии списка: отписка или новая подписка внутри обработчика не влияют на текущую
 * рассылку. Исключение одного обработчика не мешает остальным — оно уходит в `reportError`.
 */
export const createEventEmitter = <TEventMap extends object>(): IEventEmitter<TEventMap> => {
  let handlerSets: THandlerSets<TEventMap> = {};

  const on = <TName extends keyof TEventMap>(
    name: TName,
    handler: (payload: TEventMap[TName]) => void,
  ): (() => void) => {
    const handlers = handlerSets[name] ?? new Set<(payload: TEventMap[TName]) => void>();

    handlers.add(handler);
    handlerSets[name] = handlers;

    return () => {
      handlers.delete(handler);
    };
  };

  const emit = <TName extends keyof TEventMap>(name: TName, payload: TEventMap[TName]): void => {
    for (const handler of Array.from(handlerSets[name] ?? [])) {
      callHostSafely(() => {
        handler(payload);
      });
    }
  };

  const clear = (): void => {
    handlerSets = {};
  };

  return { on, emit, clear };
};
