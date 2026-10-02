import { mipLevelCount } from '../resources/texture-memory';

/**
 * Текстура-массив: все тайлы одного изображения (или шести граней куба) — слои одного размера в одной
 * текстуре, поэтому слой рисуется одним проходом шейдера при любом числе тайлов.
 */
export interface ITextureArray {
  texture: WebGLTexture;
  layerWidth: number;
  layerHeight: number;
  layerCount: number;
}

export interface ITextureArrayLayout {
  layerWidth: number;
  layerHeight: number;
  layerCount: number;
  isHorizontallyRepeated: boolean;
  isMipmapped: boolean;
}

/**
 * Повтор по горизонтали включается для эквиректангулярного изображения из одного тайла: тогда фильтрация на
 * шве ±180 смешивает левый и правый края, как и должно быть на сфере. Без MIP (пул тайлов) выделяется только
 * нулевой уровень: уровень детализации там выбирает шейдер.
 */
export const createTextureArray = (
  gl: WebGL2RenderingContext,
  layout: ITextureArrayLayout,
): ITextureArray => {
  const texture = gl.createTexture();

  gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
  gl.texStorage3D(
    gl.TEXTURE_2D_ARRAY,
    layout.isMipmapped ? mipLevelCount(layout.layerWidth, layout.layerHeight) : 1,
    gl.RGBA8,
    layout.layerWidth,
    layout.layerHeight,
    layout.layerCount,
  );
  gl.texParameteri(
    gl.TEXTURE_2D_ARRAY,
    gl.TEXTURE_MIN_FILTER,
    layout.isMipmapped ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR,
  );
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(
    gl.TEXTURE_2D_ARRAY,
    gl.TEXTURE_WRAP_S,
    layout.isHorizontallyRepeated ? gl.REPEAT : gl.CLAMP_TO_EDGE,
  );
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  return {
    texture,
    layerWidth: layout.layerWidth,
    layerHeight: layout.layerHeight,
    layerCount: layout.layerCount,
  };
};

/**
 * Загружает изображение в слой со сдвигом `offset` (пиксели от левого верхнего угла) без переворота: первая
 * строка изображения — верх слоя, как в формулах `v = 0` — зенит и `t = −1` — верх грани. Сдвиг нужен
 * подложке тайлового куба: её тайлы собираются в грань.
 */
export const uploadTextureRegion = (
  gl: WebGL2RenderingContext,
  textureArray: ITextureArray,
  layerIndex: number,
  offset: { x: number; y: number },
  image: ImageBitmap,
): void => {
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, textureArray.texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texSubImage3D(
    gl.TEXTURE_2D_ARRAY,
    0,
    offset.x,
    offset.y,
    layerIndex,
    image.width,
    image.height,
    1,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    image,
  );
};

export const uploadTextureLayer = (
  gl: WebGL2RenderingContext,
  textureArray: ITextureArray,
  layerIndex: number,
  image: ImageBitmap,
): void => {
  uploadTextureRegion(gl, textureArray, layerIndex, { x: 0, y: 0 }, image);
};

export const generateTextureMipmaps = (gl: WebGL2RenderingContext, textureArray: ITextureArray): void => {
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, textureArray.texture);
  gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
};

export const deleteTextureArray = (gl: WebGL2RenderingContext, textureArray: ITextureArray): void => {
  gl.deleteTexture(textureArray.texture);
};
