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
 * Поля панели сцен и переходов песочницы: кнопки комнат, формат сцены (суффикс `id`: `''`, `-cube`,
 * `-tiles`) и опции перехода.
 */
export interface ISceneControlElements {
  sceneButtons: HTMLElement;
  preloadButtons: HTMLElement;
  format: HTMLSelectElement;
  transitionType: HTMLSelectElement;
  duration: HTMLInputElement;
  easing: HTMLSelectElement;
  view: HTMLSelectElement;
  keepMotion: HTMLInputElement;
  moveTurn: HTMLInputElement;
  moveBlur: HTMLInputElement;
}

/**
 * `markScene` отмечает комнату и формат сцены, которая сейчас на экране.
 */
export interface ISceneControls {
  markScene: (sceneId: string | null) => void;
}

export interface ISceneControlHandlers {
  onShow: (sceneId: string, options: IShowSceneOptions) => void;
  onPreload: (sceneId: string) => void;
}

const FORMAT_SUFFIX = /-(cube|tiles)$/u;

const appendButton = (parent: HTMLElement, text: string, onClick: () => void): HTMLButtonElement => {
  const button = document.createElement('button');

  button.type = 'button';
  button.textContent = text;
  button.addEventListener('click', onClick);
  parent.append(button);

  return button;
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
 * песочница проверяет, что строки и константы словарей принимаются одинаково. «по умолчанию» у вида и плавности
 * не передаёт поле — так видны умолчания библиотеки (у шага — `keep` и `quad-out`).
 */
export const readShowSceneOptions = (elements: ISceneControlElements): IShowSceneOptions => ({
  transition: transitionOf(elements),
  ...viewOf(elements.view.value),
  keepMotion: elements.keepMotion.checked,
});

/**
 * Кнопки комнат (сцены тура без суффикса формата, подпись — `title`) для показа и предзагрузки, формат
 * сцены и список плавностей из словаря. Комната показывается в выбранном формате, смена формата сразу
 * показывает текущую комнату в нём, а выбор вида перехода сразу проигрывает его — переходом в другую
 * комнату.
 */
export const createSceneControls = (
  tour: ITour,
  elements: ISceneControlElements,
  handlers: ISceneControlHandlers,
): ISceneControls => {
  const rooms = tour.scenes.filter((scene) => !FORMAT_SUFFIX.test(scene.id));
  const roomButtons = new Map<string, HTMLButtonElement>();
  let currentRoom = rooms[0]?.id ?? null;

  const sceneIdOf = (roomId: string): string => {
    const sceneId = `${roomId}${elements.format.value}`;

    return tour.scenes.some((scene) => scene.id === sceneId) ? sceneId : roomId;
  };

  const show = (roomId: string): void => {
    currentRoom = roomId;
    handlers.onShow(sceneIdOf(roomId), readShowSceneOptions(elements));
  };

  appendOption(elements.easing, '', 'по умолчанию');

  for (const name of Object.values(EnumEasing)) {
    appendOption(elements.easing, name);
  }

  elements.easing.value = '';

  for (const room of rooms) {
    const label = room.title ?? room.id;

    roomButtons.set(
      room.id,
      appendButton(elements.sceneButtons, label, () => show(room.id)),
    );
    appendButton(elements.preloadButtons, label, () => {
      handlers.onPreload(sceneIdOf(room.id));
    });
  }

  elements.format.addEventListener('input', () => {
    if (currentRoom !== null) {
      show(currentRoom);
    }
  });
  elements.transitionType.addEventListener('input', () => {
    const otherRoom = rooms.find((room) => room.id !== currentRoom);

    if (otherRoom !== undefined) {
      show(otherRoom.id);
    }
  });

  return {
    markScene: (sceneId) => {
      const roomId = sceneId?.replace(FORMAT_SUFFIX, '') ?? null;

      currentRoom = roomId ?? currentRoom;

      for (const [id, button] of roomButtons) {
        button.setAttribute('aria-pressed', String(id === roomId));
      }

      if (sceneId !== null && roomId !== null) {
        elements.format.value = sceneId.slice(roomId.length);
        elements.format.dispatchEvent(new Event('change'));
      }
    },
  };
};
