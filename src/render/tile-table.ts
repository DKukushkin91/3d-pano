import { MAX_TILE_LEVELS, type ITileLevel } from '../tour/tile-pyramid';

/**
 * Ширина текстуры таблицы сопоставления в записях: номер записи раскладывается по строкам этой ширины.
 */
export const TILE_TABLE_WIDTH = 256;

const CHANNELS = 2;
const MAX_OPACITY = 65_535;

/**
 * Таблица сопоставления тайловой сцены: запись на каждый тайл пирамиды, `R` — слой пула + 1 (`0` — тайла
 * нет), `G` — непрозрачность проявления 0…65535. Шейдер читает её `texelFetch`; изменения копятся в памяти
 * и уходят в текстуру одним вызовом `flush`, когда что-то поменялось.
 */
export interface ITileTable {
  texture: WebGLTexture;
  width: number;
  set: (index: number, slot: number | null, opacity: number) => void;
  flush: () => void;
  dispose: () => void;
}

export const createTileTable = (gl: WebGL2RenderingContext, entryCount: number): ITileTable => {
  const height = Math.max(1, Math.ceil(entryCount / TILE_TABLE_WIDTH));
  const entries = new Uint16Array(TILE_TABLE_WIDTH * height * CHANNELS);
  const texture = gl.createTexture();
  let isDirty = true;

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RG16UI, TILE_TABLE_WIDTH, height);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  const flush = (): void => {
    if (!isDirty) {
      return;
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      TILE_TABLE_WIDTH,
      height,
      gl.RG_INTEGER,
      gl.UNSIGNED_SHORT,
      entries,
    );
    isDirty = false;
  };

  return {
    texture,
    width: TILE_TABLE_WIDTH,
    set: (index, slot, opacity) => {
      entries[index * CHANNELS] = slot === null ? 0 : slot + 1;
      entries[index * CHANNELS + 1] = Math.round(Math.min(Math.max(opacity, 0), 1) * MAX_OPACITY);
      isDirty = true;
    },
    flush,
    dispose: () => {
      gl.deleteTexture(texture);
    },
  };
};

/**
 * Данные уровней для шейдера — массивы фиксированной длины `MAX_TILE_LEVELS`. `tileScales` — доля слоя
 * пула, которую занимает тайл уровня: у уровня одним тайлом меньше `tileSize` она меньше единицы.
 */
export interface ITiledLevelUniforms {
  count: number;
  faceSizes: Float32Array;
  tilesPerSide: Float32Array;
  offsets: Int32Array;
  tileScales: Float32Array;
}

export const tiledLevelUniforms = (
  levels: readonly ITileLevel[],
  offsets: readonly number[],
  poolTileSize: number,
): ITiledLevelUniforms => {
  const uniforms: ITiledLevelUniforms = {
    count: levels.length,
    faceSizes: new Float32Array(MAX_TILE_LEVELS),
    tilesPerSide: new Float32Array(MAX_TILE_LEVELS),
    offsets: new Int32Array(MAX_TILE_LEVELS),
    tileScales: new Float32Array(MAX_TILE_LEVELS),
  };

  levels.forEach((level, index) => {
    uniforms.faceSizes[index] = level.faceSize;
    uniforms.tilesPerSide[index] = level.tilesPerSide;
    uniforms.offsets[index] = offsets[index] ?? 0;
    uniforms.tileScales[index] = level.tileSize / poolTileSize;
  });

  return uniforms;
};
