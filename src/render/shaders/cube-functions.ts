/**
 * Общие функции кубических шейдеров: луч прямолинейной проекции (`rectilinearRay`, как в
 * `math/rectilinear.ts`), грань и точка на ней (`cubeFaceFromDirection`, та же таблица, что в
 * `math/cube-faces.ts`; номер грани — индекс в `CUBE_FACES`), угловой размер пикселя и уровень MIP.
 */
export const CUBE_FUNCTIONS = `
const float FACE_FRONT = 0.0;
const float FACE_RIGHT = 1.0;
const float FACE_BACK = 2.0;
const float FACE_LEFT = 3.0;
const float FACE_UP = 4.0;
const float FACE_DOWN = 5.0;

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

float texelAngleOf(float faceSize, vec2 facePoint) {
  return (2.0 / faceSize) / (1.0 + dot(facePoint, facePoint));
}

float mipLevel(float pixelAngle, float texelAngle) {
  return log2(max(pixelAngle / texelAngle, 1e-6));
}
`;
