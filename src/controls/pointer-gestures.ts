import { type IDragStart, type IScreenPosition, dragView } from './drag-gesture';
import {
  type IMotionSample,
  INERTIA_SAMPLE_WINDOW_MS,
  ZERO_VELOCITY,
  decayVelocity,
  isMoving,
  releaseVelocity,
} from './inertia';
import type { IInputContext } from './input-target';
import { pinchFov, wheelDeltaPixels, wheelFov } from './zoom-gestures';

/**
 * Жесты указателя: перетаскивание с инерцией, щипок двумя пальцами и колесо.
 */
export interface IPointerGestures {
  handlePointerDown: (event: PointerEvent) => void;
  handlePointerMove: (event: PointerEvent) => void;
  handlePointerEnd: (event: PointerEvent) => void;
  handleWheel: (event: WheelEvent) => void;
  stepInertia: (elapsedSeconds: number) => boolean;
  stopInertia: () => void;
  activePointerCount: () => number;
  isDragging: () => boolean;
}

const PRIMARY_MOUSE_BUTTON = 0;

interface IPinchStart {
  distance: number;
  fov: number;
}

/**
 * Жест начинается только на самой панораме — canvas или пустом месте оверлея; элементы хоста в оверлее
 * получают свои нажатия и колесо. Указатель захватывается, чтобы жест не обрывался за краем просмотрщика.
 */
export const createPointerGestures = ({
  target,
  controls,
  onInteractionChange,
}: IInputContext): IPointerGestures => {
  const pointers = new Map<number, IScreenPosition>();
  let drag: (IDragStart & { pointerId: number }) | null = null;
  let pinch: IPinchStart | null = null;
  let samples: IMotionSample[] = [];
  let velocity = ZERO_VELOCITY;

  const isGestureTarget = (eventTarget: EventTarget | null): boolean =>
    eventTarget === target.canvas || eventTarget === target.overlay;

  const localPosition = (event: PointerEvent | WheelEvent): IScreenPosition => {
    const rect = target.root.getBoundingClientRect();

    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const pointerDistance = (): number => {
    const [first, second] = [...pointers.values()];

    return first === undefined || second === undefined
      ? 0
      : Math.hypot(first.x - second.x, first.y - second.y);
  };

  const startDrag = (pointerId: number, position: IScreenPosition): void => {
    drag = controls().drag ? { pointerId, pointer: position, view: target.getView() } : null;
    samples = [];
  };

  const handlePointerDown = (event: PointerEvent): void => {
    const { drag: isDragEnabled, pinch: isPinchEnabled } = controls();
    const isSecondaryMouseButton = event.pointerType === 'mouse' && event.button !== PRIMARY_MOUSE_BUTTON;

    if (!isGestureTarget(event.target) || isSecondaryMouseButton || (!isDragEnabled && !isPinchEnabled)) {
      return;
    }

    velocity = ZERO_VELOCITY;
    pointers.set(event.pointerId, localPosition(event));
    target.root.setPointerCapture(event.pointerId);

    if (pointers.size === 1) {
      startDrag(event.pointerId, localPosition(event));
    } else if (pointers.size === 2 && isPinchEnabled) {
      drag = null;
      pinch = { distance: pointerDistance(), fov: target.getView().fov };
    }

    onInteractionChange();
  };

  const moveDrag = (event: PointerEvent, position: IScreenPosition): void => {
    if (drag === null || drag.pointerId !== event.pointerId) {
      return;
    }

    target.setView(dragView(drag, position, target.getViewport(), controls().invertDrag));

    const { yaw, pitch } = target.getView();

    samples = [...samples, { timeMs: event.timeStamp, yaw, pitch }].filter(
      (sample) => event.timeStamp - sample.timeMs <= INERTIA_SAMPLE_WINDOW_MS,
    );
  };

  const handlePointerMove = (event: PointerEvent): void => {
    if (!pointers.has(event.pointerId)) {
      return;
    }

    const position = localPosition(event);

    pointers.set(event.pointerId, position);

    if (pinch === null) {
      moveDrag(event, position);
    } else {
      target.setView({ fov: pinchFov(pinch.fov, pinch.distance, pointerDistance()) });
    }

    target.requestFrame();
  };

  const finishDrag = (event: PointerEvent): void => {
    if (drag?.pointerId !== event.pointerId) {
      return;
    }

    const isRelease = event.type === 'pointerup';

    velocity = controls().inertia && isRelease ? releaseVelocity(samples, event.timeStamp) : ZERO_VELOCITY;
    drag = null;
    target.requestFrame();
  };

  const handlePointerEnd = (event: PointerEvent): void => {
    if (!pointers.delete(event.pointerId)) {
      return;
    }

    if (pinch !== null && pointers.size < 2) {
      pinch = null;

      const [remaining] = [...pointers.entries()];

      if (remaining !== undefined) {
        startDrag(remaining[0], remaining[1]);
      }
    } else {
      finishDrag(event);
    }

    onInteractionChange();
  };

  const handleWheel = (event: WheelEvent): void => {
    const { wheel: isWheelEnabled, wheelSpeed } = controls();

    if (!isWheelEnabled || !isGestureTarget(event.target)) {
      return;
    }

    event.preventDefault();
    target.setView({
      fov: wheelFov(target.getView().fov, wheelDeltaPixels(event.deltaY, event.deltaMode), wheelSpeed),
    });
    target.requestFrame();
  };

  const stepInertia = (elapsedSeconds: number): boolean => {
    if (drag !== null || !isMoving(velocity)) {
      return false;
    }

    const view = target.getView();

    target.setView({
      yaw: view.yaw + velocity.yaw * elapsedSeconds,
      pitch: view.pitch + velocity.pitch * elapsedSeconds,
    });
    velocity = decayVelocity(velocity, elapsedSeconds, controls().inertiaFriction);

    return isMoving(velocity);
  };

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerEnd,
    handleWheel,
    stepInertia,
    stopInertia: () => {
      velocity = ZERO_VELOCITY;
    },
    activePointerCount: () => pointers.size,
    isDragging: () => drag !== null,
  };
};
