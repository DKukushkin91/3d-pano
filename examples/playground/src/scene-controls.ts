import {
  EnumEasing,
  EnumSceneView,
  EnumTransitionType,
  type IShowSceneOptions,
  type ITour,
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

const appendOption = (select: HTMLSelectElement, value: string): void => {
  const option = document.createElement('option');

  option.value = value;
  option.textContent = value;
  select.append(option);
};

/**
 * Опции `showScene` из панели. Значения select пишутся строками, как пришли бы из JSON или URL: так
 * песочница проверяет, что строки и константы словарей принимаются одинаково.
 */
export const readShowSceneOptions = (elements: ISceneControlElements): IShowSceneOptions => {
  const view = elements.view.value === EnumSceneView.Keep ? EnumSceneView.Keep : EnumSceneView.Scene;
  const keepMotion = elements.keepMotion.checked;

  if (elements.transitionType.value !== EnumTransitionType.Blend) {
    return { transition: { type: EnumTransitionType.Cut }, view, keepMotion };
  }

  const easing = Object.values(EnumEasing).find((name) => name === elements.easing.value) ?? 'sine-in-out';

  return {
    transition: { type: 'blend', durationMs: Number(elements.duration.value), easing },
    view,
    keepMotion,
  };
};

/**
 * Кнопки сцен и предзагрузки по сценам тура и список плавностей из словаря.
 */
export const createSceneControls = (
  tour: ITour,
  elements: ISceneControlElements,
  handlers: ISceneControlHandlers,
): void => {
  for (const name of Object.values(EnumEasing)) {
    appendOption(elements.easing, name);
  }

  elements.easing.value = EnumEasing.SineInOut;

  for (const scene of tour.scenes) {
    appendButton(elements.sceneButtons, scene.id, () => {
      handlers.onShow(scene.id, readShowSceneOptions(elements));
    });
    appendButton(elements.preloadButtons, scene.id, () => {
      handlers.onPreload(scene.id);
    });
  }
};
