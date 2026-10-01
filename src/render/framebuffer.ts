/**
 * Цветная RGBA8-текстура размером с буфер кадра и framebuffer, который в неё рисует.
 */
export interface IFrameTexture {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

/**
 * Держатель текстуры кадра: `ensure` создаёт её нужного размера (и пересоздаёт при смене размера),
 * `release` отдаёт видеопамять. Текстуры кадра живут только во время смешивания сцен.
 */
export interface IFrameTextureSlot {
  ensure: (width: number, height: number) => IFrameTexture;
  release: () => void;
}

const createFrameTexture = (gl: WebGL2RenderingContext, width: number, height: number): IFrameTexture => {
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return { framebuffer, texture, width, height };
};

export const createFrameTextureSlot = (gl: WebGL2RenderingContext): IFrameTextureSlot => {
  let current: IFrameTexture | null = null;

  const release = (): void => {
    if (current === null) {
      return;
    }

    gl.deleteFramebuffer(current.framebuffer);
    gl.deleteTexture(current.texture);
    current = null;
  };

  return {
    ensure: (width, height) => {
      if (current?.width === width && current.height === height) {
        return current;
      }

      release();
      current = createFrameTexture(gl, width, height);

      return current;
    },
    release,
  };
};
