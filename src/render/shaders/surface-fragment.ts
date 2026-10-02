/**
 * Пиксель поверхности: цвет источника с предумноженной альфой. Почти прозрачные пиксели отбрасываются и не
 * пишут глубину, поэтому прозрачные углы картинки не закрывают поверхности за ними.
 */
export const SURFACE_FRAGMENT_SHADER: string = `#version 300 es
precision highp float;

const float MIN_ALPHA = 0.01;

uniform sampler2D source;

in vec2 textureCoordinates;
out vec4 fragmentColor;

void main() {
  vec4 color = texture(source, textureCoordinates);

  if (color.a < MIN_ALPHA) {
    discard;
  }

  fragmentColor = color;
}
`;
