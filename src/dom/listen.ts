/**
 * Подписка на событие элемента с типом события из `HTMLElementEventMap` — без приведения обработчиков к
 * `EventListener`. Возвращает функцию отписки.
 */
export const listen = <TType extends keyof HTMLElementEventMap>(
  element: HTMLElement,
  type: TType,
  handler: (event: HTMLElementEventMap[TType]) => void,
  options?: AddEventListenerOptions,
): (() => void) => {
  element.addEventListener(type, handler, options);

  return () => {
    element.removeEventListener(type, handler, options);
  };
};
