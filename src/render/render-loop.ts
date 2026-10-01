/**
 * Цикл отрисовки по требованию: кадр рисуется только после `requestRender()`. Функция кадра возвращает
 * `true`, если ей нужен следующий кадр (идёт инерция или анимация), — тогда цикл продолжается сам.
 */
export interface IRenderLoop {
  requestRender: () => void;
  dispose: () => void;
}

export const createRenderLoop = (renderFrame: (timeMs: number) => boolean): IRenderLoop => {
  let frameRequest: number | null = null;
  let isDisposed = false;

  const handleAnimationFrame = (timeMs: number): void => {
    frameRequest = null;

    if (!isDisposed && renderFrame(timeMs)) {
      requestRender();
    }
  };

  const requestRender = (): void => {
    if (isDisposed || frameRequest !== null) {
      return;
    }

    frameRequest = requestAnimationFrame(handleAnimationFrame);
  };

  const dispose = (): void => {
    isDisposed = true;

    if (frameRequest !== null) {
      cancelAnimationFrame(frameRequest);
      frameRequest = null;
    }
  };

  return { requestRender, dispose };
};
