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
import { attachViewerLogging, createEventLog, logOutcome } from './event-log';
import { addDemoPins } from './host-pins';
import { describeMissingLocalAssets, findMissingLocalAssets } from './local-assets';
import { createLookAtControls, createOverlayButton } from './look-at-controls';
import { type IPlaygroundNetwork, createPlaygroundLoader } from './playground-loader';
import { renderStatus } from './readout';
import { createSceneControls } from './scene-controls';
import { addSurfaceDemo, recordDemoClip, withTourVideo } from './surface-demo';
import { createTileControls } from './tile-controls';
import { enhancePlaygroundControls } from './ui-controls';
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
const surfacesToggle = required(document.querySelector<HTMLInputElement>('[data-surfaces]'));
const preventNavigationToggle = required(
  document.querySelector<HTMLInputElement>('[data-prevent-navigation]'),
);
const readout = required(document.querySelector<HTMLElement>('[data-readout]'));
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
let surfaces: IHotspotHandle[] = [];
let demoTour = DEMO_TOUR;
let lastView: IView | null = null;
let isNarrowTour = false;

const renderReadout = (): void => {
  const snapshot = viewer?.getSnapshot() ?? null;

  retryButton.disabled = !(
    snapshot?.status === EnumViewerStatus.Error && snapshot.error?.category === EnumErrorCategory.Resource
  );
  renderStatus(
    readout,
    snapshot,
    lastView,
    (sceneId) => demoTour.scenes.find(({ id }) => id === sceneId)?.title ?? sceneId,
  );
};

const attachLogging = (target: IPanoViewer, name: string): void => {
  attachViewerLogging(target, name, logEvent, () => preventNavigationToggle.checked);
};

const createMainViewer = (tour: ITour, view: IView | null): void => {
  viewer?.destroy();
  viewer = createPlaygroundViewer(viewerContainer, {
    tour,
    label: 'Тур по отелю',
    loader,
    ...tileControls.options(),
  });
  window.playgroundViewer = viewer;
  attachLogging(viewer, 'основной');
  viewer.on('sceneChange', ({ sceneId }) => {
    sceneControls.markScene(sceneId);
  });
  viewer.on('hotspotClick', ({ hotspot, preventDefault }) => {
    if (hotspot.target !== undefined && !preventNavigationToggle.checked) {
      preventDefault();
      handleShowScene(hotspot.target.scene, sceneControls.readOptions(hotspot.position));
    }
  });
  viewer.on('viewChange', ({ view: changedView }) => {
    lastView = changedView;
    renderReadout();
  });
  viewer.subscribe(renderReadout);
  viewer.overlay.append(
    createOverlayButton(() => {
      logEvent('нажата кнопка хоста в оверлее');
    }),
  );

  pins = pinsToggle.checked ? addDemoPins(viewer) : [];
  surfaces = surfacesToggle.checked ? addSurfaceDemo(viewer) : [];

  if (view !== null) {
    viewer.setView(view);
  }

  toggleViewerButton.textContent = 'Уничтожить';
  renderReadout();
};

const describeOutcome = (action: string, promise: Promise<boolean>): void => {
  logOutcome(logEvent, action, promise);
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
  replaceTourButton.textContent = isNarrowTour ? 'Тур с обычным обзором' : 'Тур с узким обзором';
  describeOutcome(
    'setTour',
    viewer.setTour(isNarrowTour ? NARROW_FOV_TOUR : demoTour, {
      scene: viewer.getSnapshot().sceneId ?? undefined,
      view: 'keep',
    }),
  );
};

const handlePinsChange = (): void => {
  for (const handle of [...pins, ...surfaces]) {
    handle.remove();
  }

  pins = pinsToggle.checked && viewer !== null ? addDemoPins(viewer) : [];
  surfaces = surfacesToggle.checked && viewer !== null ? addSurfaceDemo(viewer) : [];
};

const handleDemoClip = (videoUrl: string | null): void => {
  if (videoUrl === null) {
    return;
  }

  demoTour = withTourVideo(DEMO_TOUR, videoUrl);

  if (viewer !== null && !isNarrowTour) {
    const scene = viewer.getSnapshot().sceneId ?? undefined;

    describeOutcome('setTour with video', viewer.setTour(demoTour, { scene, view: 'keep' }));
  }
};

const handleSlowChange = (): void => {
  network.isSlow = slowToggle.checked;
};

const handleFailFaceChange = (): void => {
  network.failingSuffix = failFaceToggle.checked ? FAILING_FACE_SUFFIX : null;
};

const handleRetryClick = (): void => {
  viewer?.retry().catch((error: unknown) => {
    logEvent(`повтор не удался: ${String(error)}`);
  });
};

const handleBrokenTourClick = (): void => {
  const brokenTour: ITour = JSON.parse(BROKEN_TOUR_JSON);

  createMainViewer(brokenTour, null);
};

const handleToggleViewerClick = (): void => {
  if (viewer === null) {
    createMainViewer(demoTour, null);

    return;
  }

  viewer.destroy();
  viewer = null;
  window.playgroundViewer = null;
  toggleViewerButton.textContent = 'Создать';
  renderReadout();
  logEvent(
    `просмотрщик уничтожен, в контейнере осталось элементов: ${String(viewerContainer.childElementCount)}`,
  );
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

enhancePlaygroundControls(document);

const sceneControls = createSceneControls(
  DEMO_TOUR,
  {
    sceneButtons: required(document.querySelector<HTMLElement>('[data-scene-buttons]')),
    preloadButtons: required(document.querySelector<HTMLElement>('[data-preload-buttons]')),
    format: required(document.querySelector<HTMLSelectElement>('[data-scene-format]')),
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
surfacesToggle.addEventListener('change', handlePinsChange);
failFaceToggle.addEventListener('change', handleFailFaceChange);
retryButton.addEventListener('click', handleRetryClick);
replaceTourButton.addEventListener('click', handleReplaceTourClick);
brokenTourButton.addEventListener('click', handleBrokenTourClick);
toggleViewerButton.addEventListener('click', handleToggleViewerClick);
toggleSizeButton.addEventListener('click', handleToggleSizeClick);

createMainViewer(DEMO_TOUR, null);
void recordDemoClip().then(handleDemoClip);
attachLogging(createPlaygroundViewer(secondViewerContainer, { tour: DEMO_TOUR, label: 'Балкон' }), 'второй');
void showLocalHint();
