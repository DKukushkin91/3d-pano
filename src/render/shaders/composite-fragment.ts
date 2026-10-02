/**
 * Смешивание двух готовых кадров: предыдущей сцены и текущей. Кадры уже в экранных координатах, поэтому
 * пиксель берётся из той же точки обеих текстур; `weight` — доля текущей сцены. Во время шага оба кадра
 * размываются радиально: 12 выборок вдоль отрезка к `blurCenter`, длина отрезка растёт с `blurStrength`.
 */
export const COMPOSITE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

const int BLUR_SAMPLES = 12;
const float BLUR_REACH = 0.15;

uniform sampler2D previousFrame;
uniform sampler2D currentFrame;
uniform float weight;
uniform float blurStrength;
uniform vec2 blurCenter;

in vec2 normalizedPoint;
out vec4 fragmentColor;

vec4 blurred(sampler2D frame, vec2 point) {
  if (blurStrength <= 0.0) {
    return texture(frame, point);
  }

  vec2 towardCenter = (blurCenter - point) * blurStrength * BLUR_REACH;
  vec4 sum = vec4(0.0);

  for (int index = 0; index < BLUR_SAMPLES; index++) {
    sum += texture(frame, point + towardCenter * (float(index) / float(BLUR_SAMPLES - 1)));
  }

  return sum / float(BLUR_SAMPLES);
}

void main() {
  vec2 textureCoordinates = normalizedPoint * 0.5 + 0.5;

  fragmentColor = mix(blurred(previousFrame, textureCoordinates), blurred(currentFrame, textureCoordinates), weight);
}
`;
