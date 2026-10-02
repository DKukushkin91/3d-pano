import { EnumEasing, type ILookAtOptions, type IView, type TViewTarget } from '@dkukushkin/3d-pano';

/**
 * Поля панели `lookAt` песочницы.
 */
export interface ILookAtControlElements {
  targetButtons: HTMLElement;
  duration: HTMLInputElement;
  easing: HTMLSelectElement;
  fov: HTMLInputElement;
  cancel: HTMLButtonElement;
}

export interface ILookAtHandlers {
  getView: () => IView | null;
  onLookAt: (label: string, target: TViewTarget, options: ILookAtOptions) => void;
}

interface ILookAtPreset {
  label: string;
  hint: string;
  target: (view: IView) => TViewTarget;
}

const LOOK_AT_PRESETS: readonly ILookAtPreset[] = [
  { label: '→ Направо', hint: 'yaw 90°', target: () => ({ yaw: 90, pitch: 0 }) },
  { label: '↖ Влево и вверх', hint: 'yaw −120°, pitch 20°', target: () => ({ yaw: -120, pitch: 20 }) },
  {
    label: '↩ Назад',
    hint: 'Ровно назад от текущего вида',
    target: (view) => ({ yaw: view.yaw + 180, pitch: view.pitch }),
  },
  { label: '↓ Под ноги', hint: 'Направление { x: 0, y: −1, z: 0 }', target: () => ({ x: 0, y: -1, z: 0 }) },
  {
    label: '◎ Точка впереди справа',
    hint: 'Точка мира { 1.5, −1.2, 2 } — как пин товара',
    target: () => ({ x: 1.5, y: -1.2, z: 2 }),
  },
  {
    label: '◎ Точка сзади слева',
    hint: 'Точка мира { −2, −1.2, −1 }',
    target: () => ({ x: -2, y: -1.2, z: -1 }),
  },
];

const DEFAULT_EASING = EnumEasing.CubicOut;

const appendOption = (select: HTMLSelectElement, value: string): void => {
  const option = document.createElement('option');

  option.value = value;
  option.textContent = value;
  select.append(option);
};

const readOptions = (elements: ILookAtControlElements, signal: AbortSignal): ILookAtOptions => {
  const easing = Object.values(EnumEasing).find((name) => name === elements.easing.value) ?? DEFAULT_EASING;
  const fov = elements.fov.value === '' ? undefined : Number(elements.fov.value);

  return { durationMs: Number(elements.duration.value), easing, fov, signal };
};

/**
 * Кнопки целей `lookAt`, поля длительности, плавности и FOV и кнопка отмены: у каждого поворота свой
 * `AbortController`, «Остановить поворот» отменяет последний. Цели — точки сферы, «ровно сзади» от текущего вида
 * (проверка стороны поворота), направление строго вниз и точки мира относительно центра панорамы, как пины
 * товаров neometria.
 */
export const createLookAtControls = (elements: ILookAtControlElements, handlers: ILookAtHandlers): void => {
  let controller: AbortController | null = null;

  for (const name of Object.values(EnumEasing)) {
    appendOption(elements.easing, name);
  }

  elements.easing.value = DEFAULT_EASING;

  for (const preset of LOOK_AT_PRESETS) {
    const button = document.createElement('button');

    button.type = 'button';
    button.textContent = preset.label;
    button.title = preset.hint;
    button.addEventListener('click', () => {
      const view = handlers.getView();

      if (view === null) {
        return;
      }

      controller = new AbortController();
      handlers.onLookAt(
        `lookAt ${preset.label}`,
        preset.target(view),
        readOptions(elements, controller.signal),
      );
    });
    elements.targetButtons.append(button);
  }

  elements.cancel.addEventListener('click', () => {
    controller?.abort();
  });
};

/**
 * Кнопка хоста в оверлее: нажатие на неё не должно прерывать поворот и вращать камеру.
 */
export const createOverlayButton = (onClick: () => void): HTMLButtonElement => {
  const button = document.createElement('button');

  button.type = 'button';
  button.className = 'overlay-button';
  button.textContent = 'Кнопка хоста';
  button.dataset['overlayButton'] = '';
  button.addEventListener('click', onClick);

  return button;
};
