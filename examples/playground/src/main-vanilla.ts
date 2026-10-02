import {
  EnumErrorCategory,
  EnumViewerStatus,
  type IHotspotHandle,
  type ILookAtOptions,
  type IPanoViewer,
  type IShowSceneOptions,
  type ITour,
  type IView,
  type TViewTarget,
} from '@dkukushkin/3d-pano';

import { BROKEN_TOUR_JSON, DEMO_TOUR, NARROW_FOV_TOUR } from './demo-tour';
import { attachViewerLogging, createEventLog } from './event-log';
import { addDemoPins } from './host-pins';
import { describeMissingLocalAssets, findMissingLocalAssets } from './local-assets';
import { createLookAtControls, createOverlayButton } from './look-at-controls';
import { type IPlaygroundNetwork, createPlaygroundLoader } from './playground-loader';
import { createSceneControls } from './scene-controls';
import { createTileControls } from './tile-controls';
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
const pinsToggle = required(document.querySelector<HTMLInputElement>('[data-pins]'));
const preventNavigationToggle = required(
  document.querySelector<HTMLInputElement>('[data-prevent-navigation]'),
);
const readout = required(document.querySelector<HTMLPreElement>('[data-readout]'));
const logEvent = createEventLog(required(document.querySelector<HTMLOListElement>('[data-events]')));

const FAILING_FACE_SUFFIX = '/l.jpg';
const tileControls = createTileControls(
  {
    cacheBudget: required(document.querySelector<HTMLSelectElement>('[data-tile-cache]')),
    fade: required(document.querySelector<HTMLInputElement>('[data-tile-fade]')),
    preloadKeep: required(document.querySelector<HTMLInputElement>('[data-preload-keep]')),
    requests: required(document.querySelector<HTMLOutputElement>('[data-tile-requests]')),
    resetRequests: required(document.querySelector<HTMLButtonElement>('[data-reset-tile-requests]')),
  },
  (update) => viewer?.update(update),
);
const network: IPlaygroundNetwork = {
  isSlow: false,
  failingSuffix: null,
  onRequest: tileControls.countRequest,
};
const loader = createPlaygroundLoader(network);
let viewer: IPanoViewer | null = null;
let pins: IHotspotHandle[] = [];
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
  attachViewerLogging(target, name, logEvent, () => preventNavigationToggle.checked);
};

const createMainViewer = (tour: ITour, view: IView | null): void => {
  viewer?.destroy();
  viewer = createPlaygroundViewer(viewerContainer, {
    tour,
    label: 'Hotel tour',
    loader,
    ...tileControls.options(),
  });
  window.playgroundViewer = viewer;
  attachLogging(viewer, 'main');
  viewer.on('viewChange', ({ view: changedView }) => {
    lastView = changedView;
    renderReadout();
  });
  viewer.subscribe(renderReadout);
  viewer.overlay.append(
    createOverlayButton(() => {
      logEvent('overlay button click');
    }),
  );

  pins = pinsToggle.checked ? addDemoPins(viewer) : [];

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

const handleLookAt = (label: string, target: TViewTarget, options: ILookAtOptions): void => {
  if (viewer !== null) {
    describeOutcome(label, viewer.lookAt(target, options));
  }
};

const handlePreloadScene = (sceneId: string): void => {
  if (viewer !== null) {
    describeOutcome(`preloadScene ${sceneId}`, viewer.preloadScene(sceneId, tileControls.preloadOptions()));
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

const handlePinsChange = (): void => {
  for (const pin of pins) {
    pin.remove();
  }

  pins = pinsToggle.checked && viewer !== null ? addDemoPins(viewer) : [];
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
    moveTurn: required(document.querySelector<HTMLInputElement>('[data-move-turn]')),
    moveBlur: required(document.querySelector<HTMLInputElement>('[data-move-blur]')),
  },
  { onShow: handleShowScene, onPreload: handlePreloadScene },
);
createLookAtControls(
  {
    targetButtons: required(document.querySelector<HTMLElement>('[data-look-at-buttons]')),
    duration: required(document.querySelector<HTMLInputElement>('[data-look-duration]')),
    easing: required(document.querySelector<HTMLSelectElement>('[data-look-easing]')),
    fov: required(document.querySelector<HTMLInputElement>('[data-look-fov]')),
    cancel: required(document.querySelector<HTMLButtonElement>('[data-look-cancel]')),
  },
  { getView: () => viewer?.getView() ?? null, onLookAt: handleLookAt },
);
slowToggle.addEventListener('change', handleSlowChange);
pinsToggle.addEventListener('change', handlePinsChange);
failFaceToggle.addEventListener('change', handleFailFaceChange);
retryButton.addEventListener('click', handleRetryClick);
replaceTourButton.addEventListener('click', handleReplaceTourClick);
brokenTourButton.addEventListener('click', handleBrokenTourClick);
toggleViewerButton.addEventListener('click', handleToggleViewerClick);
toggleSizeButton.addEventListener('click', handleToggleSizeClick);

createMainViewer(DEMO_TOUR, null);
attachLogging(createPlaygroundViewer(secondViewerContainer, { tour: DEMO_TOUR, label: 'Balcony' }), 'second');
void showLocalHint();
