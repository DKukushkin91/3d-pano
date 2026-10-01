/**
 * Ошибка в коде хоста (обработчике события или подписчике) не должна ломать просмотрщик, но и теряться не
 * должна: она уходит в стандартный `reportError` — туда же, куда браузер отправляет непойманные ошибки
 * (консоль, `window.onerror`, Sentry). Где `reportError` нет (Node), ошибка пробрасывается отдельной
 * микрозадачей и тоже становится непойманной.
 */
export const reportHostError = (error: unknown): void => {
  if (typeof globalThis.reportError === 'function') {
    globalThis.reportError(error);

    return;
  }

  queueMicrotask(() => {
    throw error;
  });
};

/**
 * Вызывает функцию хоста и изолирует её исключение через `reportHostError`.
 */
export const callHostSafely = (callback: () => void): void => {
  try {
    callback();
  } catch (error) {
    reportHostError(error);
  }
};
