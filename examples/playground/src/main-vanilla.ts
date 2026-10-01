import {
  EnumErrorCategory,
  EnumViewerStatus,
  type IPanoViewer,
  type IShowSceneOptions,
  type ITour,
  type IView,
} from '@dkukushkin/3d-pano';

import { BROKEN_TOUR_JSON, DEMO_TOUR, NARROW_FOV_TOUR } from './demo-tour';
import { createEventLog } from './event-log';
import { describeMissingLocalAssets, findMissingLocalAssets } from './local-assets';
import { type IPlaygroundNetwork, createPlaygroundLoader } from './playground-loader';
import { createSceneControls } from './scene-controls';
import { createPlaygroundViewer } from './viewer-factory';

import './styles.css';

declare global {
  interface Window {
    playgroundViewer?: IPanoViewer | null;
  }
}

const required = <TElement extends Element>(element: TElement | null): TElement => {
  if (element === null) {
    throw new Error('playground: a required element is missing');
  }

  return element;
};

const localHint = required(document.querySelector<HTMLParagraphElement>('[data-local-hint]'));
const viewerContainer = required(document.querySelector<HTMLDivElement>('[data-viewer]'));
const secondViewerContainer = required(document.querySelector<HTMLDivElement>('[data-second-viewer]'));
const slowToggle = required(document.querySelector<HTMLInputElement>('[data-slow]'));
const failFaceToggle = required(document.querySelector<HTMLInputElement>('[data-fail-face]'));
const retryButton = required(document.querySelector<HTMLButtonElement>('[data-retry]'));
const replaceTourButton = required(document.querySelector<HTMLButtonElement>('[data-replace-tour]'));
const brokenTourButton = required(document.querySelector<HTMLButtonElement>('[data-broken-tour]'));
const toggleViewerButton = required(document.querySelector<HTMLButtonElement>('[data-toggle-viewer]'));
const toggleSizeButton = required(document.querySelector<HTMLButtonElement>('[data-toggle-size]'));
const readout = required(document.querySelector<HTMLPreElement>('[data-readout]'));
const logEvent = createEventLog(required(document.querySelector<HTMLOListElement>('[data-events]')));

const FAILING_FACE_SUFFIX = '/l.jpg';
const network: IPlaygroundNetwork = { isSlow: false, failingSuffix: null };
const loader = createPlaygroundLoader(network);
let viewer: IPanoViewer | null = null;
let lastView: IView | null = null;
let isNarrowTour = false;

const formatView = (view: IView | null): string =>
  view === null
    ? '—'
    : `yaw ${view.yaw.toFixed(1)} · pitch ${view.pitch.toFixed(1)} · roll ${view.roll.toFixed(1)} · fov ${view.fov.toFixed(1)} (${view.fovMode})`;

const renderReadout = (): void => {
  if (viewer === null) {
    readout.textContent = 'destroyed';

    return;
  }

  const snapshot = viewer.getSnapshot();
  const canRetry =
    snapshot.status === EnumViewerStatus.Error && snapshot.error?.category === EnumErrorCategory.Resource;
  const isReady = snapshot.status === 'ready';

  retryButton.disabled = !canRetry;
  readout.textContent = [
    `scene ${snapshot.sceneId ?? '—'} · status ${snapshot.status}${isReady ? ' ✓' : ''} · progress ${(snapshot.loadProgress * 100).toFixed(0)}% · interacting ${String(snapshot.isInteracting)} · transitioning ${String(snapshot.isTransitioning)}`,
    `view ${formatView(lastView)}`,
    snapshot.error === null
      ? 'error —'
      : `error ${snapshot.error.category}/${snapshot.error.code}: ${snapshot.error.message}`,
  ].join('\n');
};

const attachLogging = (target: IPanoViewer, name: string): void => {
  target.on('sceneChange', ({ sceneId, previousSceneId }) => {
    logEvent(`${name} sceneChange ${previousSceneId ?? '—'} → ${sceneId}`);
  });
  target.on('sceneLoadStart', ({ sceneId }) => {
    logEvent(`${name} sceneLoadStart ${sceneId}`);
  });
  target.on('sceneReady', ({ sceneId }) => {
    logEvent(`${name} sceneReady ${sceneId}`);
  });
  target.on('error', ({ error }) => {
    logEvent(`${name} error ${error.category}/${error.code} ${error.url ?? ''}`);
  });
};

const createMainViewer = (tour: ITour, view: IView | null): void => {
  viewer?.destroy();
  viewer = createPlaygroundViewer(viewerContainer, { tour, label: 'Hotel tour', loader });
  window.playgroundViewer = viewer;
  attachLogging(viewer, 'main');
  viewer.on('viewChange', ({ view: changedView }) => {
    lastView = changedView;
    renderReadout();
  });
  viewer.subscribe(renderReadout);

  if (view !== null) {
    viewer.setView(view);
  }

  toggleViewerButton.textContent = 'Destroy';
  renderReadout();
};

const describeOutcome = (action: string, promise: Promise<boolean>): void => {
  promise.then(
    (isDone) => {
      logEvent(`${action} → ${String(isDone)}`);
    },
    (error: unknown) => {
      const code =
        error instanceof Error && 'details' in error ? JSON.stringify(error.details) : String(error);

      logEvent(`${action} rejected ${code}`);
    },
  );
};

const handleShowScene = (sceneId: string, options: IShowSceneOptions): void => {
  if (viewer !== null) {
    describeOutcome(`showScene ${sceneId}`, viewer.showScene(sceneId, options));
  }
};

const handlePreloadScene = (sceneId: string): void => {
  if (viewer !== null) {
    describeOutcome(`preloadScene ${sceneId}`, viewer.preloadScene(sceneId));
  }
};

const handleReplaceTourClick = (): void => {
  if (viewer === null) {
    return;
  }

  isNarrowTour = !isNarrowTour;
  replaceTourButton.textContent = isNarrowTour ? 'Replace tour (wide FOV)' : 'Replace tour (narrow FOV)';
  describeOutcome(
    'setTour',
    viewer.setTour(isNarrowTour ? NARROW_FOV_TOUR : DEMO_TOUR, {
      scene: viewer.getSnapshot().sceneId ?? undefined,
      view: 'keep',
    }),
  );
};

const handleSlowChange = (): void => {
  network.isSlow = slowToggle.checked;
};

const handleFailFaceChange = (): void => {
  network.failingSuffix = failFaceToggle.checked ? FAILING_FACE_SUFFIX : null;
};

const handleRetryClick = (): void => {
  viewer?.retry().catch((error: unknown) => {
    logEvent(`retry failed: ${String(error)}`);
  });
};

const handleBrokenTourClick = (): void => {
  const brokenTour: ITour = JSON.parse(BROKEN_TOUR_JSON);

  createMainViewer(brokenTour, null);
};

const handleToggleViewerClick = (): void => {
  if (viewer === null) {
    createMainViewer(DEMO_TOUR, null);

    return;
  }

  viewer.destroy();
  viewer = null;
  window.playgroundViewer = null;
  toggleViewerButton.textContent = 'Create';
  renderReadout();
  logEvent(`main destroyed, children left in the container: ${String(viewerContainer.childElementCount)}`);
};

const handleToggleSizeClick = (): void => {
  viewerContainer.classList.toggle('viewer--compact');
};

const showLocalHint = async (): Promise<void> => {
  const missingUrls = await findMissingLocalAssets();

  if (missingUrls.length === 0) {
    return;
  }

  localHint.textContent = describeMissingLocalAssets(missingUrls);
  localHint.hidden = false;
};

createSceneControls(
  DEMO_TOUR,
  {
    sceneButtons: required(document.querySelector<HTMLElement>('[data-scene-buttons]')),
    preloadButtons: required(document.querySelector<HTMLElement>('[data-preload-buttons]')),
    transitionType: required(document.querySelector<HTMLSelectElement>('[data-transition-type]')),
    duration: required(document.querySelector<HTMLInputElement>('[data-duration]')),
    easing: required(document.querySelector<HTMLSelectElement>('[data-easing]')),
    view: required(document.querySelector<HTMLSelectElement>('[data-view]')),
    keepMotion: required(document.querySelector<HTMLInputElement>('[data-keep-motion]')),
  },
  { onShow: handleShowScene, onPreload: handlePreloadScene },
);
slowToggle.addEventListener('change', handleSlowChange);
failFaceToggle.addEventListener('change', handleFailFaceChange);
retryButton.addEventListener('click', handleRetryClick);
replaceTourButton.addEventListener('click', handleReplaceTourClick);
brokenTourButton.addEventListener('click', handleBrokenTourClick);
toggleViewerButton.addEventListener('click', handleToggleViewerClick);
toggleSizeButton.addEventListener('click', handleToggleSizeClick);

createMainViewer(DEMO_TOUR, null);
attachLogging(createPlaygroundViewer(secondViewerContainer, { tour: DEMO_TOUR, label: 'Balcony' }), 'second');
void showLocalHint();
