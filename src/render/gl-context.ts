/**
 * Контекст WebGL2 и лимиты устройства, от которых зависит нарезка изображений.
 */
export interface IGlContext {
  gl: WebGL2RenderingContext;
  maxTextureSize: number;
  maxArrayTextureLayers: number;
}

const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: false,
  antialias: false,
  depth: true,
  stencil: false,
  preserveDrawingBuffer: false,
};

/**
 * `null`, если WebGL2 недоступен: просмотрщик сообщает об этом ошибкой `webgl-unavailable`, а не исключением.
 * `maxTextureSizeOverride` уменьшает лимит текстуры только для проверки нарезки в песочнице.
 */
export const createGlContext = (
  canvas: HTMLCanvasElement,
  maxTextureSizeOverride: number | null,
): IGlContext | null => {
  const gl = canvas.getContext('webgl2', CONTEXT_ATTRIBUTES);

  if (gl === null) {
    return null;
  }

  const deviceMaxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE));

  return {
    gl,
    maxTextureSize: Math.min(deviceMaxTextureSize, maxTextureSizeOverride ?? deviceMaxTextureSize),
    maxArrayTextureLayers: Number(gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS)),
  };
};

/**
 * Явно отдаёт видеопамять при уничтожении просмотрщика, не дожидаясь сборщика мусора.
 */
export const releaseGlContext = (gl: WebGL2RenderingContext): void => {
  gl.getExtension('WEBGL_lose_context')?.loseContext();
};
