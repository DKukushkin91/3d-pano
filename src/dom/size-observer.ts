/**
 * CSS-размер элемента.
 */
export interface ICssSize {
  width: number;
  height: number;
}

/**
 * Текущий размер читается сразу, чтобы `project` и `unproject` работали до первого колбэка наблюдателя.
 */
export const readElementSize = (element: Element): ICssSize => {
  const rect = element.getBoundingClientRect();

  return { width: rect.width, height: rect.height };
};

export const observeElementSize = (element: Element, onResize: (size: ICssSize) => void): (() => void) => {
  const observer = new ResizeObserver((entries) => {
    const entry = entries.at(-1);

    if (entry !== undefined) {
      onResize({ width: entry.contentRect.width, height: entry.contentRect.height });
    }
  });

  observer.observe(element);

  return () => {
    observer.disconnect();
  };
};
