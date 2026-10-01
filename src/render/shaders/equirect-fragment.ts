/**
 * Эквиректангулярный слой. Для каждого пикселя: луч прямолинейной проекции (`rectilinearRay`, как в
 * `math/rectilinear.ts`) → направление в мире → координаты изображения (`equirectFromDirection`, как в
 * `math/equirect.ts`) → тайл текстуры-массива. Уровень MIP считается из угла, который занимает пиксель,
 * поэтому на шве ±180 не появляется полоса, которую дал бы обычный `texture()`.
 */
export const EQUIRECT_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2DArray;

const float PI = 3.141592653589793;

uniform mat3 cameraToWorld;
uniform vec2 halfTangents;
uniform sampler2DArray tiles;
uniform vec2 imageSize;
uniform vec2 tileSize;
uniform vec2 tileGrid;

in vec2 normalizedPoint;
out vec4 fragmentColor;

vec3 rectilinearRay(vec2 point, vec2 tangents) {
  return normalize(vec3(point * tangents, 1.0));
}

vec2 equirectFromDirection(vec3 direction) {
  float yaw = atan(direction.x, direction.z);
  float pitch = asin(clamp(direction.y, -1.0, 1.0));

  return vec2(yaw / (2.0 * PI) + 0.5, 0.5 - pitch / PI);
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
  vec2 imagePoint = equirectFromDirection(direction) * imageSize;
  vec2 tile = min(floor(imagePoint / tileSize), tileGrid - 1.0);
  vec2 pointInTile = (imagePoint - tile * tileSize) / tileSize;
  float layer = tile.y * tileGrid.x + tile.x;
  float texelAngle = PI / imageSize.y;

  fragmentColor = textureLod(tiles, vec3(pointInTile, layer), mipLevel(pixelAngle, texelAngle));
}
`;
