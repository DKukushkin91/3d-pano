/**
 * Один треугольник, перекрывающий весь кадр, без вершинных буферов: углы берутся по номеру вершины.
 * Фрагментный шейдер получает нормализованные координаты пикселя −1…1 и сам строит луч.
 */
export const FULLSCREEN_VERTEX_SHADER = `#version 300 es
const vec2 TRIANGLE_CORNERS[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));

out vec2 normalizedPoint;

void main() {
  normalizedPoint = TRIANGLE_CORNERS[gl_VertexID];
  gl_Position = vec4(normalizedPoint, 0.0, 1.0);
}
`;
