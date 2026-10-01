/**
 * Прямоугольник тайла в пикселях исходного изображения.
 */
export interface ITextureTile {
  column: number;
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Сетка, на которую режется изображение, чтобы каждая часть влезла в текстуру устройства. Все слои
 * текстуры-массива одного размера (`tileWidth` × `tileHeight`); крайние тайлы могут быть уже или ниже.
 */
export interface ITextureSplitPlan {
  columns: number;
  rows: number;
  tileWidth: number;
  tileHeight: number;
  tiles: ITextureTile[];
}

/**
 * План нарезки под лимит `maxTextureSize`. Изображение, которое влезает целиком, остаётся одним тайлом —
 * это самый частый случай на настольных видеокартах.
 */
export const planTextureSplit = (
  width: number,
  height: number,
  maxTextureSize: number,
): ITextureSplitPlan => {
  const columns = Math.ceil(width / maxTextureSize);
  const rows = Math.ceil(height / maxTextureSize);
  const tileWidth = Math.ceil(width / columns);
  const tileHeight = Math.ceil(height / rows);
  const tiles: ITextureTile[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = column * tileWidth;
      const y = row * tileHeight;

      tiles.push({
        column,
        row,
        x,
        y,
        width: Math.min(tileWidth, width - x),
        height: Math.min(tileHeight, height - y),
      });
    }
  }

  return { columns, rows, tileWidth, tileHeight, tiles };
};
