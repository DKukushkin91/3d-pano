import {
  EnumEasing,
  EnumSceneView,
  EnumTransitionType,
  type IShowSceneOptions,
  type ITour,
  type TEasing,
  type TSceneTransition,
} from '@dkukushkin/3d-pano';

/**
 * Поля панели переходов песочницы.
 */
export interface ISceneControlElements {
  sceneButtons: HTMLElement;
  preloadButtons: HTMLElement;
  transitionType: HTMLSelectElement;
  duration: HTMLInputElement;
  easing: HTMLSelectElement;
  view: HTMLSelectElement;
  keepMotion: HTMLInputElement;
  moveTurn: HTMLInputElement;
  moveBlur: HTMLInputElement;
}

export interface ISceneControlHandlers {
  onShow: (sceneId: string, options: IShowSceneOptions) => void;
  onPreload: (sceneId: string) => void;
}

const appendButton = (parent: HTMLElement, text: string, onClick: () => void): void => {
  const button = document.createElement('button');

  button.type = 'button';
  button.textContent = text;
  button.addEventListener('click', onClick);
  parent.append(button);
};

const appendOption = (select: HTMLSelectElement, value: string, text = value): void => {
  const option = document.createElement('option');

  option.value = value;
  option.textContent = text;
  select.append(option);
};

const viewOf = (value: string): Pick<IShowSceneOptions, 'view'> => {
  const view = Object.values(EnumSceneView).find((mode) => mode === value);

  return view === undefined ? {} : { view };
};

const easingOf = (value: string): { easing?: TEasing } => {
  const easing = Object.values(EnumEasing).find((name) => name === value);

  return easing === undefined ? {} : { easing };
};

const turnOf = (value: string): { turn?: number } => (value.trim() === '' ? {} : { turn: Number(value) });

const transitionOf = (elements: ISceneControlElements): TSceneTransition => {
  const durationMs = Number(elements.duration.value);

  if (elements.transitionType.value === EnumTransitionType.Move) {
    return {
      type: EnumTransitionType.Move,
      durationMs,
      ...easingOf(elements.easing.value),
      ...turnOf(elements.moveTurn.value),
      blur: Number(elements.moveBlur.value),
    };
  }

  if (elements.transitionType.value === EnumTransitionType.Blend) {
    return { type: 'blend', durationMs, ...easingOf(elements.easing.value) };
  }

  return { type: EnumTransitionType.Cut };
};

/**
 * Опции `showScene` из панели. Значения select пишутся строками, как пришли бы из JSON или URL: так
 * песочница проверяет, что строки и константы словарей принимаются одинаково. «default» у вида и плавности
 * не передаёт поле — так видны умолчания библиотеки (у шага — `keep` и `quad-out`).
 */
export const readShowSceneOptions = (elements: ISceneControlElements): IShowSceneOptions => ({
  transition: transitionOf(elements),
  ...viewOf(elements.view.value),
  keepMotion: elements.keepMotion.checked,
});

/**
 * Кнопки сцен и предзагрузки по сценам тура и список плавностей из словаря.
 */
export const createSceneControls = (
  tour: ITour,
  elements: ISceneControlElements,
  handlers: ISceneControlHandlers,
): void => {
  appendOption(elements.easing, '', 'default');

  for (const name of Object.values(EnumEasing)) {
    appendOption(elements.easing, name);
  }

  elements.easing.value = '';

  for (const scene of tour.scenes) {
    appendButton(elements.sceneButtons, scene.id, () => {
      handlers.onShow(scene.id, readShowSceneOptions(elements));
    });
    appendButton(elements.preloadButtons, scene.id, () => {
      handlers.onPreload(scene.id);
    });
  }
};
