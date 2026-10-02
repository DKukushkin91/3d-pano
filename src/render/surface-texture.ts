/**
 * Источник, который заливается в текстуру поверхности.
 */
export type TSurfaceTextureSource = HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | ImageBitmap;

/**
 * Заливает источник в 2D-текстуру поверхности; `previous` — та же текстура при перезаливке (перерисованный
 * `<canvas>`, новый кадр видео). Цвет хранится с предумноженной альфой, чтобы края прозрачных картинок
 * смешивались без тёмной каймы: элементы домножаются при заливке, а `ImageBitmap` декодируется уже
 * домноженным. Картинкам нужен MIP — метка на полу видна под острым углом; кадрам видео он не нужен и стоил
 * бы каждый кадр.
 */
export const uploadSurfaceTexture = (
  gl: WebGL2RenderingContext,
  source: TSurfaceTextureSource,
  previous: WebGLTexture | null,
  isMipmapped: boolean,
): WebGLTexture => {
  const texture = previous ?? gl.createTexture();

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

  if (isMipmapped) {
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, isMipmapped ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  return texture;
};
