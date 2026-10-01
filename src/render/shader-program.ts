/**
 * Программа шейдеров и найденные в ней uniform-переменные по именам.
 */
export interface IShaderProgram<TUniformName extends string> {
  program: WebGLProgram;
  uniform: (name: TUniformName) => WebGLUniformLocation | null;
}

const compileShader = (gl: WebGL2RenderingContext, type: number, source: string): WebGLShader => {
  const shader = gl.createShader(type);

  if (shader === null) {
    throw new Error('3d-pano: could not create a shader');
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(shader) ?? '';

    gl.deleteShader(shader);
    throw new Error(`3d-pano: shader compilation failed: ${log}`);
  }

  return shader;
};

const findUniforms = <TUniformName extends string>(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  names: readonly TUniformName[],
): ReadonlyMap<TUniformName, WebGLUniformLocation | null> =>
  new Map(names.map((name) => [name, gl.getUniformLocation(program, name)]));

/**
 * Собирает программу из вершинного и фрагментного шейдера. Ошибка компиляции — ошибка библиотеки, а не
 * данных хоста, поэтому бросается исключение с журналом компилятора.
 */
export const createShaderProgram = <TUniformName extends string>(
  gl: WebGL2RenderingContext,
  sources: { vertex: string; fragment: string },
  uniformNames: readonly TUniformName[],
): IShaderProgram<TUniformName> => {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, sources.vertex);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, sources.fragment);
  const program = gl.createProgram();

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true && !gl.isContextLost()) {
    const log = gl.getProgramInfoLog(program) ?? '';

    gl.deleteProgram(program);
    throw new Error(`3d-pano: shader program linking failed: ${log}`);
  }

  const uniforms = findUniforms(gl, program, uniformNames);

  return { program, uniform: (name) => uniforms.get(name) ?? null };
};
