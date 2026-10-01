const BYTES_PER_TEXEL = 4;

/**
 * Размер текстуры-массива, по которому считается кэш сцен.
 */
export interface ITextureArraySize {
  layerWidth: number;
  layerHeight: number;
  layerCount: number;
}

/**
 * Полная цепочка MIP до 1×1: столько уровней выделяет `texStorage3D`.
 */
export const mipLevelCount = (width: number, height: number): number =>
  Math.floor(Math.log2(Math.max(width, height))) + 1;

/**
 * Байты RGBA8-текстуры-массива со всеми уровнями MIP — оценка видеопамяти для бюджета кэша сцен; драйвер
 * может выделять больше, поэтому это именно оценка.
 */
export const textureArrayByteSize = ({ layerWidth, layerHeight, layerCount }: ITextureArraySize): number =>
  Array.from({ length: mipLevelCount(layerWidth, layerHeight) }, (_unused, level) => {
    const width = Math.max(1, Math.floor(layerWidth / 2 ** level));
    const height = Math.max(1, Math.floor(layerHeight / 2 ** level));

    return width * height * BYTES_PER_TEXEL * layerCount;
  }).reduce((sum, bytes) => sum + bytes, 0);
