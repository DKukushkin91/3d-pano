import { type ReactElement, type ReactNode, useContext, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';

import type { IAddHotspotOptions, IHotspotHandle, TAddHotspotSurface } from '../hotspots/hotspot-types';
import { isSameSurface } from '../hotspots/surface-options';
import type { IPanoViewer } from '../viewer/viewer-types';
import { PanoViewerContext } from './hotspot-context';

/**
 * Пропсы `<Hotspot>`: то же, что у `addHotspot`, кроме элемента — его создаёт компонент; `viewer` нужен
 * только вне `<PanoViewer>`, например с `usePanoViewer`.
 */
export interface IHotspotProps extends Omit<IAddHotspotOptions, 'element'> {
  viewer?: IPanoViewer | null;
  className?: string;
  children?: ReactNode;
}

type THotspotPlacement = Omit<IAddHotspotOptions, 'element'>;

interface IAppliedKeys {
  position: string;
  scene: string | undefined;
  anchor: string | undefined;
  plane: string;
  surface: TAddHotspotSurface | undefined;
}

const keysOf = ({ position, scene, anchor, plane, surface }: THotspotPlacement): IAppliedKeys => ({
  position: JSON.stringify(position),
  scene,
  anchor,
  plane: JSON.stringify(plane ?? null),
  surface,
});

const applyChanges = (
  handle: IHotspotHandle,
  placement: THotspotPlacement,
  previous: IAppliedKeys,
  next: IAppliedKeys,
): void => {
  if (next.position !== previous.position) {
    handle.setPosition(placement.position);
  }

  if (next.scene !== previous.scene) {
    handle.setScene(placement.scene);
  }

  if (next.anchor !== previous.anchor) {
    handle.setAnchor(placement.anchor);
  }

  if (next.plane !== previous.plane) {
    handle.setPlane(placement.plane);
  }

  if (!isSameSurface(previous.surface, next.surface)) {
    handle.setSurface(placement.surface);
  }
};

/**
 * Хотспот хоста в React: дети рендерятся порталом в элемент, который библиотека держит в проекции
 * `position`, поэтому вращение панорамы не вызывает рендеров. Пропсы сравниваются по значению — точку
 * можно собирать прямо в рендере, — и изменившееся поле уходит в свой сеттер; у `surface` URL и ширина
 * сравниваются по значению, а элементы — по ссылке. Размонтирование убирает хотспот. Контейнер портала создаётся в рендере, когда просмотрщик уже есть, — на сервере и при гидратации
 * компонент ничего не рисует; `className` получает обёртка детей.
 */
export const Hotspot = ({
  viewer: viewerProp,
  position,
  scene,
  anchor,
  plane,
  surface,
  className,
  children,
}: IHotspotProps): ReactElement | null => {
  const contextViewer = useContext(PanoViewerContext);
  const viewer = viewerProp === undefined ? contextViewer : viewerProp;
  const element = useMemo(
    () => (viewer === null ? null : viewer.overlay.ownerDocument.createElement('div')),
    [viewer],
  );
  const handleRef = useRef<IHotspotHandle | null>(null);
  const latest = useRef<THotspotPlacement>({ position, scene, anchor, plane, surface });
  const applied = useRef<IAppliedKeys | null>(null);

  useEffect(() => {
    latest.current = { position, scene, anchor, plane, surface };
  });

  useEffect(() => {
    if (viewer === null || element === null) {
      return undefined;
    }

    const handle = viewer.addHotspot({ element, ...latest.current });

    handleRef.current = handle;
    applied.current = keysOf(latest.current);

    return () => {
      handle.remove();
      handleRef.current = null;
      applied.current = null;
    };
  }, [viewer, element]);

  useEffect(() => {
    if (handleRef.current === null || applied.current === null) {
      return;
    }

    const next = keysOf(latest.current);

    applyChanges(handleRef.current, latest.current, applied.current, next);
    applied.current = next;
  });

  if (element === null) {
    return null;
  }

  return createPortal(
    className === undefined ? children : <div className={className}>{children}</div>,
    element,
  );
};
