import { type ICompositeBlur, createCompositePass } from './composite-pass';
import { createFrameTextureSlot } from './framebuffer';
import type { TLayerDrawing } from './layer-drawing';
import type { IFrameCamera, IRenderer } from './renderer';
import type { ISurfaceDrawing } from './surface-pass';

/**
 * Предыдущая сцена во время смешивания или шага со своей камерой. `frozenKey` не `null`, когда камера
 * замерла: он меняется только с новым смешиванием, поэтому замерший кадр рисуется один раз и заново лишь
 * при смене размера буфера.
 */
export interface IPreviousSceneFrame {
  drawings: readonly TLayerDrawing[];
  surfaces: readonly ISurfaceDrawing[];
  camera: IFrameCamera;
  frozenKey: object | null;
}

export interface IComposedFrame {
  camera: IFrameCamera;
  current: readonly TLayerDrawing[];
  surfaces: readonly ISurfaceDrawing[];
  previous: IPreviousSceneFrame | null;
  weight: number;
  blur: ICompositeBlur | null;
  bufferWidth: number;
  bufferHeight: number;
}

export interface IFrameComposer {
  draw: (frame: IComposedFrame) => void;
  dispose: () => void;
}

interface IFrozenFrame {
  key: object;
  width: number;
  height: number;
}

/**
 * Кадр вне смешивания рисуется прямо в canvas, как без переходов. Во время смешивания каждая сцена
 * рисуется в свою текстуру размером с буфер, а проход смешивания сводит их; после смешивания текстуры
 * освобождаются.
 */
export const createFrameComposer = (gl: WebGL2RenderingContext, renderer: IRenderer): IFrameComposer => {
  const previousSlot = createFrameTextureSlot(gl);
  const currentSlot = createFrameTextureSlot(gl);
  const compositePass = createCompositePass(gl);
  let frozen: IFrozenFrame | null = null;

  const releaseTextures = (): void => {
    previousSlot.release();
    currentSlot.release();
    frozen = null;
  };

  const isFrozenFrameReady = (previous: IPreviousSceneFrame, width: number, height: number): boolean =>
    previous.frozenKey !== null &&
    frozen?.key === previous.frozenKey &&
    frozen.width === width &&
    frozen.height === height;

  const drawBlend = (frame: IComposedFrame, previous: IPreviousSceneFrame): void => {
    const { camera, bufferWidth: width, bufferHeight: height } = frame;
    const previousTexture = previousSlot.ensure(width, height);
    const currentTexture = currentSlot.ensure(width, height);

    if (!isFrozenFrameReady(previous, width, height)) {
      renderer.drawFrame(previous, { width, height, target: previousTexture.framebuffer });
      frozen = previous.frozenKey === null ? null : { key: previous.frozenKey, width, height };
    }

    renderer.drawFrame(
      { camera, drawings: frame.current, surfaces: frame.surfaces },
      { width, height, target: currentTexture.framebuffer },
    );
    compositePass.draw(previousTexture.texture, currentTexture.texture, {
      weight: frame.weight,
      blur: frame.blur,
      width,
      height,
    });
  };

  return {
    draw: (frame) => {
      if (frame.previous !== null) {
        drawBlend(frame, frame.previous);

        return;
      }

      releaseTextures();
      renderer.drawFrame(
        { camera: frame.camera, drawings: frame.current, surfaces: frame.surfaces },
        { width: frame.bufferWidth, height: frame.bufferHeight, target: null },
      );
    },
    dispose: () => {
      releaseTextures();
      compositePass.dispose();
    },
  };
};
