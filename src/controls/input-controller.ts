import { listen } from '../dom/listen';
import type { TResolvedControlsOptions } from '../viewer/viewer-types';
import type { IInputTarget } from './input-target';
import { createKeyboardInput } from './keyboard-input';
import { createPointerGestures } from './pointer-gestures';
import { touchActionFor } from './touch-action';

/**
 * Ввод просмотрщика. `step` вызывается из кадра отрисовки и двигает камеру по инерции и клавиатуре;
 * возвращает `true`, пока движение продолжается и нужен следующий кадр. `handleSceneChange` вызывается в
 * момент появления новой сцены: без `keepMotion` гасит инерцию, а идущее перетаскивание и щипок
 * продолжаются от нового вида — это ввод пользователя, а не движение камеры.
 */
export interface IInputController {
  update: (controls: TResolvedControlsOptions) => void;
  step: (timeMs: number) => boolean;
  handleSceneChange: (keepMotion: boolean) => void;
  dispose: () => void;
}

const MAX_FRAME_SECONDS = 0.1;
const FIRST_FRAME_SECONDS = 1 / 60;

/**
 * Собирает жесты указателя и клавиатуру, вешает слушатели на корень и следит за `touch-action`, курсором и
 * флагом взаимодействия. `onInteractionChange` получает `true`, пока пользователь держит указатель или
 * клавиши управления. Первый кадр после покоя считается длительностью 1/60 с: время предыдущего кадра
 * неизвестно, а нулевой шаг съел бы короткое нажатие.
 */
export const createInputController = (
  target: IInputTarget,
  initialControls: TResolvedControlsOptions,
  onInteractionChange: (isInteracting: boolean) => void,
): IInputController => {
  const { root } = target;
  let controls = initialControls;
  let lastStepTimeMs: number | null = null;

  const cursorFor = (isDragging: boolean): string => {
    if (!controls.drag) {
      return '';
    }

    return isDragging ? 'grabbing' : 'grab';
  };

  const context = {
    target,
    controls: () => controls,
    onInteractionChange: () => {
      refreshInteraction();
    },
  };
  const pointerGestures = createPointerGestures(context);
  const keyboardInput = createKeyboardInput(context);

  const refreshInteraction = (): void => {
    const activePointers = pointerGestures.activePointerCount();

    onInteractionChange(activePointers > 0 || keyboardInput.pressedCount() > 0);
    root.style.userSelect = activePointers > 0 ? 'none' : '';
    root.style.cursor = cursorFor(pointerGestures.isDragging());
  };

  const step = (timeMs: number): boolean => {
    const elapsedSeconds =
      lastStepTimeMs === null
        ? FIRST_FRAME_SECONDS
        : Math.min((timeMs - lastStepTimeMs) / 1000, MAX_FRAME_SECONDS);
    const isInertiaMoving = pointerGestures.stepInertia(elapsedSeconds);
    const isKeyboardMoving = keyboardInput.step(elapsedSeconds);
    const isAnimating = isInertiaMoving || isKeyboardMoving;

    lastStepTimeMs = isAnimating ? timeMs : null;

    return isAnimating;
  };

  const update = (nextControls: TResolvedControlsOptions): void => {
    controls = nextControls;
    root.style.touchAction = touchActionFor(controls);

    if (!controls.inertia) {
      pointerGestures.stopInertia();
    }

    if (!controls.keyboard) {
      keyboardInput.release();
    }

    refreshInteraction();
  };

  const removers = [
    listen(root, 'pointerdown', pointerGestures.handlePointerDown),
    listen(root, 'pointermove', pointerGestures.handlePointerMove),
    listen(root, 'pointerup', pointerGestures.handlePointerEnd),
    listen(root, 'pointercancel', pointerGestures.handlePointerEnd),
    listen(root, 'lostpointercapture', pointerGestures.handlePointerEnd),
    listen(root, 'wheel', pointerGestures.handleWheel, { passive: false }),
    listen(root, 'keydown', keyboardInput.handleKeyDown),
    listen(root, 'keyup', keyboardInput.handleKeyUp),
    listen(root, 'blur', keyboardInput.handleBlur),
  ];

  update(initialControls);

  return {
    update,
    step,
    handleSceneChange: (keepMotion) => {
      if (!keepMotion) {
        pointerGestures.stopInertia();
      }

      pointerGestures.reanchor();
    },
    dispose: () => {
      for (const remove of removers) {
        remove();
      }
    },
  };
};
