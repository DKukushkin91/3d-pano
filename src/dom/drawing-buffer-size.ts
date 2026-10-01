/**
 * Размер буфера кадра в физических пикселях: CSS-размер × `min(devicePixelRatio, maxPixelRatio)` ×
 * `renderScale`. Ограничение плотности не даёт жечь батарею на экранах 3×, где разница с 2× почти не видна.
 */
export const drawingBufferSize = (settings: {
  cssWidth: number;
  cssHeight: number;
  devicePixelRatio: number;
  maxPixelRatio: number;
  renderScale: number;
}): { width: number; height: number } => {
  const ratio = Math.min(settings.devicePixelRatio, settings.maxPixelRatio) * settings.renderScale;

  return {
    width: Math.max(1, Math.round(settings.cssWidth * ratio)),
    height: Math.max(1, Math.round(settings.cssHeight * ratio)),
  };
};
