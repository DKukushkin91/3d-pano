import type { IPanoError, IShowSceneOptions } from '@dkukushkin/3d-pano';
import { type IPanoViewer, PanoViewer } from '@dkukushkin/3d-pano/react';
import { type ChangeEvent, type ReactElement, useEffect, useMemo, useState } from 'react';

import { DEMO_TOUR, NARROW_FOV_TOUR } from './demo-tour';
import { LoadingBar } from './loading-bar';
import { describeMissingLocalAssets, findMissingLocalAssets } from './local-assets';
import { OwnMarkupDemo } from './own-markup-demo';
import { ROOM_SWITCH, ScenePicker } from './scene-picker';
import { ViewReadout } from './view-readout';

interface IReactPlaygroundState {
  viewer: IPanoViewer | null;
  viewerInstances: number;
  appCommits: number;
  sceneLoadStarts: number;
  viewChanges: number;
  sceneChanges: string[];
  errors: string[];
}

declare global {
  interface Window {
    reactPlayground?: IReactPlaygroundState;
  }
}

const LOOK_RIGHT_YAW = 90;
const START_SCENE = 'hotel-room';
const REF_SCENE = 'balcony';
const STALE_SCENE = 'attic';

const playgroundState: IReactPlaygroundState = {
  viewer: null,
  viewerInstances: 0,
  appCommits: 0,
  sceneLoadStarts: 0,
  viewChanges: 0,
  sceneChanges: [],
  errors: [],
};

window.reactPlayground = playgroundState;

const handleSceneLoadStart = (): void => {
  playgroundState.sceneLoadStarts += 1;
};

const handleError = ({ error }: { error: IPanoError }): void => {
  playgroundState.errors.push(error.code);
};

const handleViewChange = (): void => {
  playgroundState.viewChanges += 1;
};

/**
 * React-страница песочницы: сцена как проп с разными переходами для комнаты и ремонта, переход через
 * `ref`, тур, который пересобирается на каждом рендере, замена тура, монтирование и размонтирование.
 * Вращение камеры страницу не перерисовывает: вид показывает `ViewReadout` в обход состояния. Счётчики,
 * включая число коммитов `App`, лежат в `window.reactPlayground` для проверки из консоли.
 */
export const App = (): ReactElement => {
  const [viewer, setViewer] = useState<IPanoViewer | null>(null);
  const [isMounted, setIsMounted] = useState(true);
  const [isKeyboardEnabled, setIsKeyboardEnabled] = useState(true);
  const [isNarrowTour, setIsNarrowTour] = useState(false);
  const [scene, setScene] = useState(START_SCENE);
  const [sceneOptions, setSceneOptions] = useState<IShowSceneOptions>(ROOM_SWITCH);
  const [shownScene, setShownScene] = useState<string | null>(null);
  const [missingUrls, setMissingUrls] = useState<string[]>([]);

  const controls = useMemo(() => ({ keyboard: isKeyboardEnabled }), [isKeyboardEnabled]);
  const tour = { ...(isNarrowTour ? NARROW_FOV_TOUR : DEMO_TOUR) };

  const handleSceneChange = ({ sceneId }: { sceneId: string }): void => {
    playgroundState.sceneChanges.push(sceneId);
    setShownScene(sceneId);
  };

  const handlePick = (sceneId: string, options: IShowSceneOptions): void => {
    setScene(sceneId);
    setSceneOptions(options);
  };

  const handleRefSceneClick = (): void => {
    void viewer?.showScene(REF_SCENE, ROOM_SWITCH);
  };

  const handleStaleSceneClick = (): void => {
    setScene(STALE_SCENE);
  };

  const handleTourToggle = (): void => {
    setIsNarrowTour((current) => !current);
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
    playgroundState.appCommits += 1;
  });

  useEffect(() => {
    playgroundState.viewer = viewer;

    if (viewer !== null) {
      playgroundState.viewerInstances += 1;
    }
  }, [viewer]);

  return (
    <main>
      <nav>
        <a href="/">Vanilla playground</a>
      </nav>
      <h1>PanoViewer</h1>
      {missingUrls.length > 0 && <p className="hint">{describeMissingLocalAssets(missingUrls)}</p>}
      <ScenePicker scene={scene} onPick={handlePick} />
      <fieldset className="toolbar">
        <button type="button" onClick={handleRefSceneClick} data-ref-scene>
          {`ref.showScene('${REF_SCENE}')`}
        </button>
        <button type="button" onClick={handleStaleSceneClick} data-stale-scene>
          {`scene="${STALE_SCENE}"`}
        </button>
        <button type="button" onClick={handleTourToggle} data-toggle-tour>
          {isNarrowTour ? 'Wide FOV tour' : 'Narrow FOV tour'}
        </button>
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
          tour={tour}
          scene={scene}
          sceneOptions={sceneOptions}
          label="Hotel tour"
          className="viewer"
          controls={controls}
          onSceneLoadStart={handleSceneLoadStart}
          onSceneChange={handleSceneChange}
          onViewChange={handleViewChange}
          onError={handleError}
        >
          <LoadingBar viewer={viewer} />
        </PanoViewer>
      )}
      <p className="readout" data-react-readout>
        {`scene prop ${scene} · on screen ${shownScene ?? '—'} · `}
        <ViewReadout viewer={viewer} />
      </p>
      <OwnMarkupDemo tour={DEMO_TOUR} />
    </main>
  );
};
