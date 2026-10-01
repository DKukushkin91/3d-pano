import { createCompositePass } from './composite-pass';
import { createFrameTextureSlot } from './framebuffer';
import type { TLayerDrawing } from './layer-drawing';
import type { IFrameCamera, IRenderer } from './renderer';

/**
 * Предыдущая сцена во время смешивания. `frozenCamera: null` — она движется вместе с живой камерой;
 * иначе это замершая камера, а `frozenKey` меняется только с новым смешиванием, поэтому замерший кадр
 * рисуется один раз и заново лишь при смене размера буфера.
 */
export interface IPreviousSceneFrame {
  drawings: readonly TLayerDrawing[];
  frozenCamera: IFrameCamera | null;
  frozenKey: object | null;
}

export interface IComposedFrame {
  camera: IFrameCamera;
  current: readonly TLayerDrawing[];
  previous: IPreviousSceneFrame | null;
  weight: number;
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
      renderer.drawFrame(
        previous.frozenCamera ?? camera,
        previous.drawings,
        width,
        height,
        previousTexture.framebuffer,
      );
      frozen = previous.frozenKey === null ? null : { key: previous.frozenKey, width, height };
    }

    renderer.drawFrame(camera, frame.current, width, height, currentTexture.framebuffer);
    compositePass.draw(previousTexture.texture, currentTexture.texture, frame.weight, width, height);
  };

  return {
    draw: (frame) => {
      if (frame.previous !== null) {
        drawBlend(frame, frame.previous);

        return;
      }

      releaseTextures();
      renderer.drawFrame(frame.camera, frame.current, frame.bufferWidth, frame.bufferHeight, null);
    },
    dispose: () => {
      releaseTextures();
      compositePass.dispose();
    },
  };
};
