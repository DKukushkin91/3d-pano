import { type ReactNode, useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { IHotspot, TRenderHotspot } from '../hotspots/hotspot-types';

/**
 * Отрисовка хотспота тура в React: `ReactNode` вместо DOM-элемента.
 */
export type TRenderHotspotNode = (hotspot: IHotspot, sceneId: string) => ReactNode;

interface IHotspotPortal {
  key: number;
  container: HTMLElement;
  hotspot: IHotspot;
  sceneId: string;
}

export interface IHotspotPortals {
  renderHotspot: TRenderHotspot | undefined;
  hotspotPortals: ReactNode;
}

/**
 * Мост между `renderHotspot` ядра и React. Ядру отдаётся стабильная функция: она создаёт пустой контейнер
 * и запоминает его, пока `signal` хотспота не отменён, а React рендерит в контейнеры порталы с последней
 * переданной функцией. Новая функция в каждом рендере не пересоздаёт элементы хотспотов; появление и
 * уход хотспотов (смена сцены) перерисовывают компонент один раз, вращение — ни разу.
 */
export const useHotspotPortals = (render: TRenderHotspotNode | undefined): IHotspotPortals => {
  const [portals, setPortals] = useState<readonly IHotspotPortal[]>([]);
  const nextKey = useRef(0);

  const renderContainer = useCallback<TRenderHotspot>((hotspot, { sceneId, signal }) => {
    const container = document.createElement('div');
    const portal: IHotspotPortal = { key: nextKey.current, container, hotspot, sceneId };

    nextKey.current += 1;
    setPortals((current) => [...current, portal]);
    signal.addEventListener(
      'abort',
      () => {
        setPortals((current) => current.filter((item) => item !== portal));
      },
      { once: true },
    );

    return container;
  }, []);

  return {
    renderHotspot: render === undefined ? undefined : renderContainer,
    hotspotPortals:
      render === undefined || portals.length === 0
        ? null
        : portals.map((portal) =>
            createPortal(render(portal.hotspot, portal.sceneId), portal.container, String(portal.key)),
          ),
  };
};
