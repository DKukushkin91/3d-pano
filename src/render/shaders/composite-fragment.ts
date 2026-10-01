/**
 * Смешивание двух готовых кадров: предыдущей сцены и текущей. Кадры уже в экранных координатах, поэтому
 * пиксель берётся из той же точки обеих текстур; `weight` — доля текущей сцены.
 */
export const COMPOSITE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D previousFrame;
uniform sampler2D currentFrame;
uniform float weight;

in vec2 normalizedPoint;
out vec4 fragmentColor;

void main() {
  vec2 textureCoordinates = normalizedPoint * 0.5 + 0.5;

  fragmentColor = mix(texture(previousFrame, textureCoordinates), texture(currentFrame, textureCoordinates), weight);
}
`;
