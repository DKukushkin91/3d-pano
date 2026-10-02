# @dkukushkin/3d-pano

A framework-agnostic WebGL2 viewer for 360° panoramas and virtual tours.

- Show a scene from a single equirectangular image or from six cube faces, with a low-resolution preview while the full image loads.
- Switch scenes of a tour with a cut or a blend and 31 easing curves; keep the view and the inertia when only the renovation changes.
- Preload neighbouring scenes into video memory, within a budget, and replace the whole tour without recreating the viewer.
- Turn the camera smoothly to a point of the panorama or of the world with `lookAt`: easing, zoom in the same move, cancellation with `AbortSignal`.
- Drag, inertia, wheel, pinch and keyboard controls with configurable limits.
- No runtime dependencies in the core; an optional React adapter lives in `@dkukushkin/3d-pano/react`.
- Safe to import on the server: nothing touches the DOM until a viewer is created.

> The package is under active development. The API described in `docs/` is the contract of the first release and is being implemented step by step.

## Install

```bash
pnpm add @dkukushkin/3d-pano
```

React is an optional peer dependency (`>=18`) — only needed for the `/react` entry.

## Quick start

```ts
import { createPanoViewer } from '@dkukushkin/3d-pano';

const viewer = createPanoViewer(document.querySelector('#tour')!, {
  label: 'Apartment tour',
  tour: {
    scenes: [
      {
        id: 'room',
        source: { type: 'equirect', url: '/panoramas/room.jpg' },
        preview: { type: 'equirect', url: '/panoramas/room-preview.jpg' },
      },
    ],
  },
});

viewer.on('sceneReady', ({ sceneId }) => {
  console.info('scene is ready', sceneId);
});
```

The container needs a size. A scene can also be six cube faces: `{ type: 'cube', url: '/tiles/room/{face}.jpg' }`.

## Scenes

```ts
void viewer.preloadScene('bedroom');

await viewer.showScene('bedroom', {
  transition: { type: 'blend', durationMs: 800, easing: 'sine-in-out' },
});
```

The current scene stays on screen until the next one has loaded; the promise resolves `true` when the switch is complete and `false` when a newer call superseded it. See [Scenes and transitions](docs/api.md#scenes-and-transitions).

## Camera animation

```ts
const controller = new AbortController();

const isReached = await viewer.lookAt({ yaw: 120, pitch: -15 }, { fov: 60, signal: controller.signal });
```

The camera turns in 900 ms with `cubic-out` by default and stays within the scene limits. The promise resolves `true` when the camera arrives and `false` when the user grabs the panorama, another call supersedes the turn or the signal aborts. See [Camera animation](docs/api.md#camera-animation).

## React

```tsx
import { PanoViewer } from '@dkukushkin/3d-pano/react';

export const Tour = () => (
  <PanoViewer tour={tour} label="Apartment tour" className="absolute inset-0" onSceneReady={handleSceneReady}>
    <YourOverlayUi />
  </PanoViewer>
);
```

`usePanoViewer` gives the same viewer for your own markup, and `usePanoSnapshot` reads its state. See [docs/react.md](docs/react.md).

## Documentation

- [Tour format](docs/tour.md) — scenes, image sources, initial view and limits, coordinate conventions.
- [Viewer API](docs/api.md) — creating a viewer, methods, scene switching and transitions, preloading, camera animation, events, state snapshot, errors, image loading.
- [React](docs/react.md) — `<PanoViewer>`, the `scene` prop and hooks.

## Development

```bash
pnpm install
pnpm check          # format, lint, comment policy, clean-room, specs, types, build, contract checks, package, playground
pnpm build:watch    # in one terminal
pnpm dev            # playground, see examples/README.md
```

The project is developed spec-first with [OpenSpec](https://github.com/Fission-AI/OpenSpec): see `openspec/`.

## License

MIT
