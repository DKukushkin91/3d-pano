import type { IPreloadSceneOptions, IShowSceneOptions } from '../navigation/navigation-types';
import type { IEventEmitter } from '../state/event-emitter';
import type { IScene, ITour } from '../tour/tour-types';
import type { IPanoViewerEventMap, TViewTarget } from '../viewer/viewer-types';
import { resolveHotspotPlane } from './add-hotspot-options';
import { EnumHotspotAnchor } from './hotspot-dictionaries';
import { hotspotLabel } from './hotspot-label';
import type { IHotspotLayer, ILayerEntry } from './hotspot-layer';
import {
  type IEnterState,
  NOT_ENTERED,
  enterTransition,
  hotspotNavigationOf,
  hotspotPreloadOf,
} from './hotspot-presence';
import type { IHotspot, TRenderHotspot } from './hotspot-types';

/**
 * Что хотспоты тура берут у просмотрщика: слой, события, навигацию и камеру.
 */
export interface ITourHotspotsHost {
  layer: IHotspotLayer;
  emitter: IEventEmitter<IPanoViewerEventMap>;
  showScene: (sceneId: string, options: IShowSceneOptions) => Promise<boolean>;
  preloadScene: (sceneId: string, options: IPreloadSceneOptions) => Promise<boolean>;
  lookAt: (position: TViewTarget) => void;
  isInFrame: (position: TViewTarget) => boolean;
}

export interface ITourHotspots {
  show: (scene: IScene, tour: ITour) => void;
  setRenderer: (render: TRenderHotspot | null) => void;
  dispose: () => void;
}

interface ITourEntry {
  hotspot: IHotspot;
  sceneId: string;
  layerEntry: ILayerEntry;
  controller: AbortController;
  state: IEnterState;
}

interface IShownScene {
  scene: IScene;
  tour: ITour;
  key: string;
}

const ignore = (): undefined => undefined;

const sceneKey = (scene: IScene): string => `${scene.id}\n${JSON.stringify(scene.hotspots ?? [])}`;

const isKeyboardFocus = (target: EventTarget | null): boolean =>
  target instanceof Element && target.matches(':focus-visible');

const createDefaultButton = (ownerDocument: Document, hotspot: IHotspot, tour: ITour): HTMLButtonElement => {
  const button = ownerDocument.createElement('button');
  const targetScene = tour.scenes.find((scene) => scene.id === hotspot.target?.scene);
  const label = hotspotLabel(hotspot, targetScene?.title);

  button.type = 'button';
  button.textContent = label.text;
  button.dataset.panoHotspotButton = '';

  if (label.label !== null) {
    button.setAttribute('aria-label', label.label);
  }

  return button;
};

/**
 * Хотспоты сцены на экране. Элемент — результат `renderHotspot` или кнопка по умолчанию (если функция
 * вернула не элемент — тоже кнопка). Слушатели висят на контейнере слоя и снимаются тем же `signal`, что
 * получает `renderHotspot`. Клик отправляет `hotspotClick` и, если его не отменили, переходит в `target`;
 * вход (наведение или фокус) отправляет `hotspotEnter` и предзагружает сцену `target` с её видом; фокус с клавиатуры
 * на хотспоте вне кадра поворачивает к нему камеру. Хотспоты пересоздаются, только если сцена или её
 * хотспоты изменились, — замена тура с той же сценой их не трогает.
 */
export const createTourHotspots = (ownerDocument: Document, host: ITourHotspotsHost): ITourHotspots => {
  let render: TRenderHotspot | null = null;
  let shown: IShownScene | null = null;
  let entries: ITourEntry[] = [];

  const setState = (entry: ITourEntry, nextState: IEnterState): void => {
    const transition = enterTransition(entry.state, nextState);
    const payload = { sceneId: entry.sceneId, hotspot: entry.hotspot };

    entry.state = nextState;

    if (transition === 'enter') {
      host.emitter.emit('hotspotEnter', payload);

      if (entry.hotspot.target !== undefined) {
        const { sceneId, options } = hotspotPreloadOf(entry.hotspot.target);

        host.preloadScene(sceneId, options).catch(ignore);
      }
    } else if (transition === 'leave') {
      host.emitter.emit('hotspotLeave', payload);
    }
  };

  const handleClick = (entry: ITourEntry): void => {
    let isPrevented = false;

    host.emitter.emit('hotspotClick', {
      sceneId: entry.sceneId,
      hotspot: entry.hotspot,
      preventDefault: () => {
        isPrevented = true;
      },
    });

    const navigation = isPrevented ? null : hotspotNavigationOf(entry.hotspot);

    if (navigation !== null) {
      host.showScene(navigation.sceneId, navigation.options).catch(ignore);
    }
  };

  const handleFocusIn = (entry: ITourEntry, event: FocusEvent): void => {
    setState(entry, { ...entry.state, isFocused: true });

    if (isKeyboardFocus(event.target) && !host.isInFrame(entry.hotspot.position)) {
      host.lookAt(entry.hotspot.position);
    }
  };

  const listen = (entry: ITourEntry): void => {
    const { aligner } = entry.layerEntry;
    const options = { signal: entry.controller.signal };

    aligner.addEventListener('click', () => handleClick(entry), options);
    aligner.addEventListener(
      'pointerenter',
      () => setState(entry, { ...entry.state, isHovered: true }),
      options,
    );
    aligner.addEventListener(
      'pointerleave',
      () => setState(entry, { ...entry.state, isHovered: false }),
      options,
    );
    aligner.addEventListener('focusin', (event) => handleFocusIn(entry, event), options);
    aligner.addEventListener(
      'focusout',
      (event) => {
        if (!(event.relatedTarget instanceof Node && aligner.contains(event.relatedTarget))) {
          setState(entry, { ...entry.state, isFocused: false });
        }
      },
      options,
    );
  };

  const elementFor = (hotspot: IHotspot, { scene, tour }: IShownScene, signal: AbortSignal): HTMLElement => {
    const element = render?.(hotspot, { sceneId: scene.id, signal });

    return element instanceof HTMLElement ? element : createDefaultButton(ownerDocument, hotspot, tour);
  };

  const createEntry = (hotspot: IHotspot, scene: IShownScene): ITourEntry => {
    const controller = new AbortController();
    const layerEntry = host.layer.add({
      element: elementFor(hotspot, scene, controller.signal),
      position: hotspot.position,
      scene: scene.scene.id,
      anchor: hotspot.anchor ?? EnumHotspotAnchor.Center,
      plane: resolveHotspotPlane(hotspot.plane),
      id: hotspot.id,
    });
    const entry: ITourEntry = {
      hotspot,
      sceneId: scene.scene.id,
      layerEntry,
      controller,
      state: NOT_ENTERED,
    };

    listen(entry);

    return entry;
  };

  const clear = (): void => {
    for (const entry of entries) {
      setState(entry, NOT_ENTERED);
      entry.controller.abort();
      entry.layerEntry.remove();
    }

    entries = [];
  };

  const build = (): void => {
    clear();

    const current = shown;

    if (current !== null) {
      entries = (current.scene.hotspots ?? []).map((hotspot) => createEntry(hotspot, current));
    }
  };

  return {
    show: (scene, tour) => {
      const key = sceneKey(scene);
      const isSame = shown?.key === key;

      shown = { scene, tour, key };

      if (!isSame) {
        build();
      }
    },
    setRenderer: (nextRender) => {
      if (render !== nextRender) {
        render = nextRender;
        build();
      }
    },
    dispose: () => {
      clear();
      shown = null;
    },
  };
};
