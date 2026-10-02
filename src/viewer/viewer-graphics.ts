import { drawingBufferSize } from '../dom/drawing-buffer-size';
import { screenFromDirection } from '../math/rectilinear';
import { subtractVectors } from '../math/vector3';
import type { INavigatorFrame } from '../navigation/navigator-types';
import type { ICompositeBlur } from '../render/composite-pass';
import { type IFrameComposer, type IPreviousSceneFrame, createFrameComposer } from '../render/frame-composer';
import type { IGlContext } from '../render/gl-context';
import { type IFrameCamera, type IRenderer, createRenderer } from '../render/renderer';
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

const UNIT_VIEWPORT = { width: 1, height: 1 };
const FRAME_CENTER = { x: 0.5, y: 0.5 };

const previousCameraOf = (
  frame: INavigatorFrame<ISceneSession>,
  camera: ICameraState,
): IFrameCamera | null => {
  if (frame.previous === null) {
    return null;
  }

  const liveView = camera.getView();
  const view = frame.previousView ?? { ...liveView, yaw: liveView.yaw + frame.previousYawShift };
  const previousCamera = camera.frameCameraOf(view);

  return previousCamera === null || frame.move === null
    ? previousCamera
    : { ...previousCamera, space: frame.move.previous };
};

const blurOf = (
  frame: INavigatorFrame<ISceneSession>,
  previousCamera: IFrameCamera | null,
): ICompositeBlur | null => {
  const { move } = frame;

  if (move === null || move.blurStrength <= 0 || previousCamera === null) {
    return null;
  }

  const toward = subtractVectors(move.target, move.previous.offset);
  const point = screenFromDirection(toward, UNIT_VIEWPORT, previousCamera.basis, previousCamera.halfTangents);

  return {
    strength: move.blurStrength,
    center: point === null || !point.isInView ? FRAME_CENTER : { x: point.x, y: 1 - point.y },
  };
};

const previousSceneOf = (
  frame: INavigatorFrame<ISceneSession>,
  previousCamera: IFrameCamera | null,
): IPreviousSceneFrame | null => {
  if (frame.previous === null || previousCamera === null) {
    return null;
  }

  return {
    drawings: frame.previous.drawings(),
    camera: previousCamera,
    frozenKey: frame.move === null ? frame.previousView : null,
  };
};

const prepareScenes = (
  frame: INavigatorFrame<ISceneSession>,
  cameras: { current: IFrameCamera; previous: IFrameCamera | null },
  buffer: ITileFrame['buffer'],
  timeMs: number,
): boolean => {
  const isCurrentAnimating = frame.current?.prepareFrame({ ...cameras.current, buffer }, timeMs) ?? false;
  const previousCamera = cameras.previous ?? cameras.current;
  const isPreviousAnimating = frame.previous?.prepareFrame({ ...previousCamera, buffer }, timeMs) ?? false;

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

      const currentCamera = frameCamera;
      const previousCamera = previousCameraOf(frame, camera);

      tiles.startFrame();

      const isAnimating = prepareScenes(
        frame,
        { current: currentCamera, previous: previousCamera },
        bufferSize,
        timeMs,
      );

      tiles.finishFrame();
      composer.draw({
        camera: currentCamera,
        current: frame.current?.drawings() ?? [],
        previous: previousSceneOf(frame, previousCamera),
        weight: frame.weight,
        blur: blurOf(frame, previousCamera),
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
