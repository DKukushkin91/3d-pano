/**
 * Угол поверхности по номеру вершины (полоса из двух треугольников, без вершинных буферов): точка
 * `O + u·A + v·B` относительно камеры, как в `surfaceQuad`. Проекция — как в `screenFromDirection`, глубина —
 * как в `surfaceDepth`: `z_clip = z_c − 2n`, `w = z_c`, поэтому ближняя плоскость `n` обрезает поверхность у
 * камеры, а дальней нет.
 */
export const SURFACE_VERTEX_SHADER: string = `#version 300 es
uniform mat3 cameraToWorld;
uniform vec2 halfTangents;
uniform float nearPlane;
uniform vec3 origin;
uniform vec3 across;
uniform vec3 down;

out vec2 textureCoordinates;

void main() {
  vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  vec3 point = origin + corner.x * across + corner.y * down;
  vec3 camera = point * cameraToWorld;

  textureCoordinates = corner;
  gl_Position = vec4(camera.x / halfTangents.x, camera.y / halfTangents.y, camera.z - 2.0 * nearPlane, camera.z);
}
`;
