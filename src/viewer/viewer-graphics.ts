import { drawingBufferSize } from '../dom/drawing-buffer-size';
import type { INavigatorFrame } from '../navigation/navigator-types';
import { type IFrameComposer, type IPreviousSceneFrame, createFrameComposer } from '../render/frame-composer';
import type { IGlContext } from '../render/gl-context';
import { type IRenderer, createRenderer } from '../render/renderer';
import type { ITileFrame } from '../tiles/visible-tiles';
import type { ICameraState } from './camera-state';
import type { ISceneSession } from './scene-session';
import type { ITileService } from './tile-service';

/**
 * Плотность буфера кадра: `devicePixelRatio` окна и опции просмотрщика.
 */
export interface IPixelDensity {
  devicePixelRatio: number;
  maxPixelRatio: number;
  renderScale: number;
}

/**
 * `draw` возвращает `true`, когда сценам нужны ещё кадры: идёт проявление тайлов.
 */
export interface IViewerGraphics {
  draw: (
    frame: INavigatorFrame<ISceneSession>,
    camera: ICameraState,
    density: IPixelDensity,
    timeMs: number,
  ) => boolean;
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

const prepareScenes = (
  frame: INavigatorFrame<ISceneSession>,
  camera: ICameraState,
  tileFrame: ITileFrame,
  timeMs: number,
): boolean => {
  const isCurrentAnimating = frame.current?.prepareFrame(tileFrame, timeMs) ?? false;
  const previousCamera = frame.previousView === null ? null : camera.frameCameraOf(frame.previousView);
  const previousFrame = previousCamera === null ? tileFrame : { ...previousCamera, buffer: tileFrame.buffer };
  const isPreviousAnimating = frame.previous?.prepareFrame(previousFrame, timeMs) ?? false;

  return isCurrentAnimating || isPreviousAnimating;
};

/**
 * Отрисовка кадра просмотрщика: размер буфера по контейнеру и плотности, подготовка тайлов сцен на экране
 * (текущая первой забирает место в пуле, предыдущая при смешивании — со своей замершей или живой камерой),
 * затем текущая сцена — прямо в canvas или, во время смешивания, через текстуры кадра вместе с предыдущей.
 */
export const createViewerGraphics = (
  glContext: IGlContext,
  canvas: HTMLCanvasElement,
  tiles: ITileService,
): IViewerGraphics => {
  const renderer: IRenderer = createRenderer(glContext);
  const composer: IFrameComposer = createFrameComposer(glContext.gl, renderer);

  return {
    draw: (frame, camera, density, timeMs) => {
      const frameCamera = camera.frameCamera();

      if (frameCamera === null) {
        return false;
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

      tiles.startFrame();

      const isAnimating = prepareScenes(frame, camera, { ...frameCamera, buffer: bufferSize }, timeMs);

      tiles.finishFrame();
      composer.draw({
        camera: frameCamera,
        current: frame.current?.drawings() ?? [],
        previous: previousSceneOf(frame, camera),
        weight: frame.weight,
        bufferWidth: bufferSize.width,
        bufferHeight: bufferSize.height,
      });

      return isAnimating;
    },
    dispose: () => {
      composer.dispose();
      renderer.dispose();
    },
  };
};
