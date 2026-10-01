import { drawingBufferSize } from '../dom/drawing-buffer-size';
import type { INavigatorFrame } from '../navigation/navigator-types';
import { type IFrameComposer, type IPreviousSceneFrame, createFrameComposer } from '../render/frame-composer';
import type { IGlContext } from '../render/gl-context';
import { type IRenderer, createRenderer } from '../render/renderer';
import type { ICameraState } from './camera-state';
import type { ISceneSession } from './scene-session';

/**
 * Плотность буфера кадра: `devicePixelRatio` окна и опции просмотрщика.
 */
export interface IPixelDensity {
  devicePixelRatio: number;
  maxPixelRatio: number;
  renderScale: number;
}

export interface IViewerGraphics {
  draw: (frame: INavigatorFrame<ISceneSession>, camera: ICameraState, density: IPixelDensity) => void;
  dispose: () => void;
}

const previousSceneOf = (
  frame: INavigatorFrame<ISceneSession>,
  camera: ICameraState,
): IPreviousSceneFrame | null => {
  if (frame.previous === null) {
    return null;
  }

  return {
    drawings: frame.previous.drawings(),
    frozenCamera: frame.previousView === null ? null : camera.frameCameraOf(frame.previousView),
    frozenKey: frame.previousView,
  };
};

/**
 * Отрисовка кадра просмотрщика: размер буфера по контейнеру и плотности, затем текущая сцена — прямо в
 * canvas или, во время смешивания, через текстуры кадра вместе с предыдущей.
 */
export const createViewerGraphics = (glContext: IGlContext, canvas: HTMLCanvasElement): IViewerGraphics => {
  const renderer: IRenderer = createRenderer(glContext);
  const composer: IFrameComposer = createFrameComposer(glContext.gl, renderer);

  return {
    draw: (frame, camera, density) => {
      const frameCamera = camera.frameCamera();

      if (frameCamera === null) {
        return;
      }

      const viewport = camera.getViewport();
      const bufferSize = drawingBufferSize({
        cssWidth: viewport.width,
        cssHeight: viewport.height,
        ...density,
      });

      if (canvas.width !== bufferSize.width || canvas.height !== bufferSize.height) {
        canvas.width = bufferSize.width;
        canvas.height = bufferSize.height;
      }

      composer.draw({
        camera: frameCamera,
        current: frame.current?.drawings() ?? [],
        previous: previousSceneOf(frame, camera),
        weight: frame.weight,
        bufferWidth: bufferSize.width,
        bufferHeight: bufferSize.height,
      });
    },
    dispose: () => {
      composer.dispose();
      renderer.dispose();
    },
  };
};
