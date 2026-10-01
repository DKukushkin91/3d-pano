# @dkukushkin/3d-pano

A framework-agnostic WebGL2 viewer for 360° panoramas and virtual tours.

- Show a scene from a single equirectangular image or from six cube faces, with a low-resolution preview while the full image loads.
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

## Documentation

- [Tour format](docs/tour.md) — scenes, image sources, initial view and limits, coordinate conventions.
- [Viewer API](docs/api.md) — creating a viewer, methods, events, state snapshot, errors, image loading.
- [React](docs/react.md) — `<PanoViewer>` and hooks.

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
