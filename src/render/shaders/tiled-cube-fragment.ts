import { MAX_TILE_LEVELS } from '../../tour/tile-pyramid';
import { CUBE_FUNCTIONS } from './cube-functions';
import { SPACE_FUNCTIONS } from './space-functions';

/**
 * Тайловый куб. Для пикселя считается нужный уровень (`neededLevelOf`, как `neededLevelAt` в
 * `tiles/tile-math.ts`): самый мелкий, у которого тексель не больше пикселя. Затем от нужного уровня к
 * грубым ищутся тайлы в таблице сопоставления (`offset_l + face · n_l² + row · n_l + col`, как
 * `tileTableIndex`); непрозрачный тайл закрывает всё ниже, проявляющийся смешивается с тем, что под ним.
 * Под всеми уровнями лежит подложка из своей текстуры с MIP. Уровня подробнее нужного шейдер не берёт:
 * в пуле нет MIP, и уменьшенный тексель дал бы рябь.
 */
export const TILED_CUBE_FRAGMENT_SHADER: string = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;
precision highp usampler2D;

const int MAX_LEVELS = ${String(MAX_TILE_LEVELS)};
const float MAX_OPACITY = 65535.0;
const float OPAQUE_REMAINDER = 0.001;

uniform mat3 cameraToWorld;
uniform vec2 halfTangents;
uniform sampler2DArray baseTiles;
uniform float baseFaceSize;
uniform uint readyFaces;
uniform sampler2DArray poolTiles;
uniform usampler2D tileTable;
uniform int tableWidth;
uniform int levelCount;
uniform float levelFaceSizes[MAX_LEVELS];
uniform float levelTilesPerSide[MAX_LEVELS];
uniform int levelOffsets[MAX_LEVELS];
uniform float levelTileScales[MAX_LEVELS];

${SPACE_FUNCTIONS}
in vec2 normalizedPoint;
out vec4 fragmentColor;

${CUBE_FUNCTIONS}
int neededLevelOf(float pixelAngle, vec2 facePoint) {
  for (int level = 0; level < MAX_LEVELS; level++) {
    if (level >= levelCount) {
      break;
    }

    if (texelAngleOf(levelFaceSizes[level], facePoint) <= pixelAngle) {
      return level;
    }
  }

  return levelCount - 1;
}

uvec2 tableEntry(int index) {
  return texelFetch(tileTable, ivec2(index % tableWidth, index / tableWidth), 0).rg;
}

void main() {
  vec3 direction = sceneDirection(normalize(cameraToWorld * rectilinearRay(normalizedPoint, halfTangents)));
  float pixelAngle = pixelAngleOf(direction);
  vec3 facePoint = cubeFaceFromDirection(direction);
  uint faceBit = 1u << uint(facePoint.z);

  if ((readyFaces & faceBit) == 0u) {
    discard;
  }

  vec2 faceCoordinates = (facePoint.xy + 1.0) / 2.0;
  int face = int(facePoint.z);
  int neededLevel = neededLevelOf(pixelAngle, facePoint.xy);
  vec4 color = vec4(0.0);
  float remaining = 1.0;

  for (int level = MAX_LEVELS - 1; level >= 1; level--) {
    if (level > neededLevel) {
      continue;
    }

    float tilesPerSide = levelTilesPerSide[level];
    int count = int(tilesPerSide);
    vec2 tile = clamp(floor(faceCoordinates * tilesPerSide), 0.0, tilesPerSide - 1.0);
    uvec2 entry = tableEntry(levelOffsets[level] + face * count * count + int(tile.y) * count + int(tile.x));

    if (entry.x == 0u) {
      continue;
    }

    float halfTexel = 0.5 * tilesPerSide / levelFaceSizes[level];
    vec2 pointInTile = clamp(faceCoordinates * tilesPerSide - tile, halfTexel, 1.0 - halfTexel);
    vec3 poolPoint = vec3(pointInTile * levelTileScales[level], float(entry.x - 1u));
    float opacity = float(entry.y) / MAX_OPACITY;

    color += remaining * opacity * textureLod(poolTiles, poolPoint, 0.0);
    remaining *= 1.0 - opacity;

    if (remaining < OPAQUE_REMAINDER) {
      break;
    }
  }

  float baseTexelAngle = texelAngleOf(baseFaceSize, facePoint.xy);
  vec4 base = textureLod(baseTiles, vec3(faceCoordinates, facePoint.z), mipLevel(pixelAngle, baseTexelAngle));

  fragmentColor = color + remaining * base;
}
`;
