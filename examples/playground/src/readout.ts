import {
  EnumViewerStatus,
  type IPanoViewerSnapshot,
  type IView,
  type TViewerStatus,
} from '@dkukushkin/3d-pano';

const STATUS_LABELS: Readonly<Record<TViewerStatus, string>> = {
  [EnumViewerStatus.Loading]: 'загрузка',
  [EnumViewerStatus.Preview]: 'превью',
  [EnumViewerStatus.Ready]: 'готово',
  [EnumViewerStatus.Error]: 'ошибка',
};

const chip = (text: string, modifier?: string): HTMLSpanElement => {
  const element = document.createElement('span');

  element.className = modifier === undefined ? 'chip' : `chip chip--${modifier}`;
  element.textContent = text;

  return element;
};

const formatView = (view: IView): string =>
  `yaw ${view.yaw.toFixed(0)}° · pitch ${view.pitch.toFixed(0)}° · обзор ${view.fov.toFixed(0)}°`;

const chipsOf = (snapshot: IPanoViewerSnapshot, sceneTitle: string): HTMLSpanElement[] => {
  const chips = [chip(STATUS_LABELS[snapshot.status], snapshot.status), chip(sceneTitle)];

  if (snapshot.loadProgress < 1) {
    chips.push(chip(`загружено ${(snapshot.loadProgress * 100).toFixed(0)}%`));
  }

  if (snapshot.isTransitioning) {
    chips.push(chip('смена сцены', 'accent'));
  }

  if (snapshot.isInteracting) {
    chips.push(chip('вращение', 'accent'));
  }

  return chips;
};

/**
 * Строка состояния под панорамой: короткие метки статуса, сцены и того, что происходит сейчас, вид
 * камеры и текст ошибки, если она есть.
 */
export const renderStatus = (
  element: HTMLElement,
  snapshot: IPanoViewerSnapshot | null,
  view: IView | null,
  sceneTitle: (sceneId: string) => string,
): void => {
  if (snapshot === null) {
    element.replaceChildren(chip('просмотрщик уничтожен', 'error'));

    return;
  }

  const viewText = document.createElement('span');

  viewText.className = 'status__view';
  viewText.textContent = view === null ? '' : formatView(view);
  element.replaceChildren(
    ...chipsOf(snapshot, snapshot.sceneId === null ? '—' : sceneTitle(snapshot.sceneId)),
    viewText,
  );

  if (snapshot.error !== null) {
    const error = document.createElement('p');

    error.className = 'status__error';
    error.textContent = `${snapshot.error.code}: ${snapshot.error.message}`;
    element.append(error);
  }
};
