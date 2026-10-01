import type { IView } from '@dkukushkin/3d-pano';
import { type IPanoViewer, PanoViewer } from '@dkukushkin/3d-pano/react';
import { type ChangeEvent, type ReactElement, useEffect, useMemo, useState } from 'react';

import { DEMO_TOUR } from './demo-tour';
import { LoadingBar } from './loading-bar';
import { describeMissingLocalAssets, findMissingLocalAssets } from './local-assets';
import { OwnMarkupDemo } from './own-markup-demo';

declare global {
  interface Window {
    reactPlayground?: { viewer: IPanoViewer | null; sceneLoadStarts: number; viewChanges: number };
  }
}

const LOOK_RIGHT_YAW = 90;

const playgroundState: NonNullable<Window['reactPlayground']> = {
  viewer: null,
  sceneLoadStarts: 0,
  viewChanges: 0,
};

window.reactPlayground = playgroundState;

const handleSceneLoadStart = (): void => {
  playgroundState.sceneLoadStarts += 1;
};

/**
 * React-страница песочницы: компонент с полосой загрузки в оверлее, управление видом через `ref`,
 * монтирование и размонтирование, отключение клавиатуры на лету и хук со своей разметкой. Счётчики
 * событий лежат в `window.reactPlayground` для проверки из консоли.
 */
export const App = (): ReactElement => {
  const [viewer, setViewer] = useState<IPanoViewer | null>(null);
  const [isMounted, setIsMounted] = useState(true);
  const [isKeyboardEnabled, setIsKeyboardEnabled] = useState(true);
  const [missingUrls, setMissingUrls] = useState<string[]>([]);
  const [view, setView] = useState<IView | null>(null);

  const controls = useMemo(() => ({ keyboard: isKeyboardEnabled }), [isKeyboardEnabled]);

  const handleViewChange = ({ view: changedView }: { view: IView }): void => {
    playgroundState.viewChanges += 1;
    setView(changedView);
  };

  const handleLookRightClick = (): void => {
    viewer?.setView({ yaw: LOOK_RIGHT_YAW });
  };

  const handleMountToggle = (): void => {
    setIsMounted((current) => !current);
  };

  const handleKeyboardChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setIsKeyboardEnabled(event.target.checked);
  };

  useEffect(() => {
    let isCancelled = false;

    void findMissingLocalAssets().then((urls) => {
      if (!isCancelled) {
        setMissingUrls(urls);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    playgroundState.viewer = viewer;
  }, [viewer]);

  return (
    <main>
      <nav>
        <a href="/">Vanilla playground</a>
      </nav>
      <h1>PanoViewer</h1>
      {missingUrls.length > 0 && <p className="hint">{describeMissingLocalAssets(missingUrls)}</p>}
      <fieldset className="toolbar">
        <button type="button" onClick={handleLookRightClick} data-look-right>
          Look right
        </button>
        <button type="button" onClick={handleMountToggle} data-toggle-mount>
          {isMounted ? 'Unmount' : 'Mount'}
        </button>
        <label>
          <input type="checkbox" checked={isKeyboardEnabled} onChange={handleKeyboardChange} data-keyboard />{' '}
          keyboard
        </label>
      </fieldset>
      {isMounted && (
        <PanoViewer
          ref={setViewer}
          tour={DEMO_TOUR}
          label="Hotel tour"
          className="viewer"
          controls={controls}
          onSceneLoadStart={handleSceneLoadStart}
          onViewChange={handleViewChange}
        >
          <LoadingBar viewer={viewer} />
        </PanoViewer>
      )}
      <p className="readout" data-react-readout>
        {view === null
          ? 'view —'
          : `view yaw ${view.yaw.toFixed(1)} · pitch ${view.pitch.toFixed(1)} · fov ${view.fov.toFixed(1)}`}
      </p>
      <OwnMarkupDemo tour={DEMO_TOUR} />
    </main>
  );
};
