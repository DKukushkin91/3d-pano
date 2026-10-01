/**
 * Кубический слой. Грань выбирается по наибольшей компоненте направления (`cubeFaceFromDirection`, та же
 * таблица, что в `math/cube-faces.ts`); номер грани — индекс в `CUBE_FACES`. Грань рисуется, только когда
 * её бит есть в `readyFaces`: грани проявляются поверх превью по мере загрузки. Угловой размер текселя
 * уменьшается к краям грани как `1 / (1 + s² + t²)` — это учитывается при выборе MIP.
 */
export const CUBE_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;

const float FACE_FRONT = 0.0;
const float FACE_RIGHT = 1.0;
const float FACE_BACK = 2.0;
const float FACE_LEFT = 3.0;
const float FACE_UP = 4.0;
const float FACE_DOWN = 5.0;

uniform mat3 cameraToWorld;
uniform vec2 halfTangents;
uniform sampler2DArray tiles;
uniform float faceSize;
uniform float tilesPerSide;
uniform uint readyFaces;

in vec2 normalizedPoint;
out vec4 fragmentColor;

vec3 rectilinearRay(vec2 point, vec2 tangents) {
  return normalize(vec3(point * tangents, 1.0));
}

vec3 cubeFaceFromDirection(vec3 direction) {
  vec3 magnitude = abs(direction);

  if (magnitude.z >= magnitude.x && magnitude.z >= magnitude.y) {
    return direction.z > 0.0
      ? vec3(direction.x / direction.z, -direction.y / direction.z, FACE_FRONT)
      : vec3(direction.x / direction.z, direction.y / direction.z, FACE_BACK);
  }

  if (magnitude.x >= magnitude.y) {
    return direction.x > 0.0
      ? vec3(-direction.z / direction.x, -direction.y / direction.x, FACE_RIGHT)
      : vec3(-direction.z / direction.x, direction.y / direction.x, FACE_LEFT);
  }

  return direction.y > 0.0
    ? vec3(direction.x / direction.y, direction.z / direction.y, FACE_UP)
    : vec3(-direction.x / direction.y, direction.z / direction.y, FACE_DOWN);
}

float pixelAngleOf(vec3 direction) {
  return max(length(dFdx(direction)), length(dFdy(direction)));
}

float mipLevel(float pixelAngle, float texelAngle) {
  return log2(max(pixelAngle / texelAngle, 1e-6));
}

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
  float texelAngle = (2.0 / faceSize) / (1.0 + dot(facePoint.xy, facePoint.xy));

  fragmentColor = textureLod(tiles, vec3(pointInTile, layer), mipLevel(pixelAngle, texelAngle));
}
`;
