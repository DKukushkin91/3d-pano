import type { IInputContext } from './input-target';
import {
  STILL_MOTION,
  type TKeyAction,
  applyMotion,
  isMotionActive,
  keyActionFromKey,
  stepMotion,
  targetMotion,
} from './keyboard-motion';

/**
 * Клавиатурное управление: зажатые клавиши задают целевую скорость, движение идёт в кадрах отрисовки.
 */
export interface IKeyboardInput {
  handleKeyDown: (event: KeyboardEvent) => void;
  handleKeyUp: (event: KeyboardEvent) => void;
  handleBlur: () => void;
  step: (elapsedSeconds: number) => boolean;
  pressedCount: () => number;
  release: () => void;
}

/**
 * Клавиши обрабатываются, только когда в фокусе сам корень просмотрщика: стрелки внутри кнопок хоста в
 * оверлее и сочетания с Ctrl, Cmd и Alt (например, масштаб страницы) остаются браузеру и хосту. Короткое
 * нажатие, отпущенное раньше первого кадра, всё равно проходит через один кадр движения — иначе быстрый
 * тап по стрелке ничего бы не делал.
 */
export const createKeyboardInput = ({
  target,
  controls,
  onInteractionChange,
}: IInputContext): IKeyboardInput => {
  const pressedActions = new Set<TKeyAction>();
  const releasesAfterStep = new Set<TKeyAction>();
  let steppedActions = new Set<TKeyAction>();
  let motion = STILL_MOTION;

  const handleKeyDown = (event: KeyboardEvent): void => {
    const action = keyActionFromKey(event.key);
    const hasModifier = event.ctrlKey || event.metaKey || event.altKey;

    if (!controls().keyboard || event.target !== target.root || action === undefined || hasModifier) {
      return;
    }

    event.preventDefault();
    pressedActions.add(action);
    releasesAfterStep.delete(action);
    onInteractionChange();
    target.requestFrame();
  };

  const handleKeyUp = (event: KeyboardEvent): void => {
    const action = keyActionFromKey(event.key);

    if (action === undefined || !pressedActions.has(action)) {
      return;
    }

    if (steppedActions.has(action)) {
      pressedActions.delete(action);
      onInteractionChange();
    } else {
      releasesAfterStep.add(action);
    }

    target.requestFrame();
  };

  const release = (): void => {
    pressedActions.clear();
    releasesAfterStep.clear();
    onInteractionChange();
  };

  const applyDeferredReleases = (): void => {
    for (const action of releasesAfterStep) {
      pressedActions.delete(action);
    }

    if (releasesAfterStep.size > 0) {
      releasesAfterStep.clear();
      onInteractionChange();
    }

    steppedActions = new Set(pressedActions);
  };

  const step = (elapsedSeconds: number): boolean => {
    motion = stepMotion(motion, targetMotion(pressedActions, controls().keyboardSpeed), elapsedSeconds);

    if (isMotionActive(motion)) {
      target.setView(applyMotion(target.getView(), motion, elapsedSeconds));
    }

    applyDeferredReleases();

    return isMotionActive(motion) || pressedActions.size > 0;
  };

  return {
    handleKeyDown,
    handleKeyUp,
    handleBlur: release,
    step,
    pressedCount: () => pressedActions.size,
    release,
  };
};
