import { CUBE_FUNCTIONS } from './cube-functions';

/**
 * Кубический слой. Грань выбирается по наибольшей компоненте направления (`cubeFaceFromDirection`, та же
 * таблица, что в `math/cube-faces.ts`); номер грани — индекс в `CUBE_FACES`. Грань рисуется, только когда
 * её бит есть в `readyFaces`: грани проявляются поверх превью по мере загрузки. Угловой размер текселя
 * уменьшается к краям грани как `1 / (1 + s² + t²)` — это учитывается при выборе MIP.
 */
export const CUBE_FRAGMENT_SHADER: string = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;

uniform mat3 cameraToWorld;
uniform vec2 halfTangents;
uniform sampler2DArray tiles;
uniform float faceSize;
uniform float tilesPerSide;
uniform uint readyFaces;

in vec2 normalizedPoint;
out vec4 fragmentColor;

${CUBE_FUNCTIONS}
void main() {
  vec3 direction = normalize(cameraToWorld * rectilinearRay(normalizedPoint, halfTangents));
  float pixelAngle = pixelAngleOf(direction);
  vec3 facePoint = cubeFaceFromDirection(direction);
  uint faceBit = 1u << uint(facePoint.z);

  if ((readyFaces & faceBit) == 0u) {
    discard;
  }

  vec2 faceCoordinates = (facePoint.xy + 1.0) / 2.0;
  vec2 tile = min(floor(faceCoordinates * tilesPerSide), tilesPerSide - 1.0);
  vec2 pointInTile = faceCoordinates * tilesPerSide - tile;
  float layer = facePoint.z * tilesPerSide * tilesPerSide + tile.y * tilesPerSide + tile.x;
  float texelAngle = texelAngleOf(faceSize, facePoint.xy);

  fragmentColor = textureLod(tiles, vec3(pointInTile, layer), mipLevel(pixelAngle, texelAngle));
}
`;
