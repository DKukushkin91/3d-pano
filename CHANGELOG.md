# Changelog

All notable changes to `@dkukushkin/3d-pano` are listed here. The project follows [Semantic Versioning](https://semver.org/); before 1.0 a minor version may change the API.

## 0.1.0 — 2026-10-02

The first public version: everything a real-estate tour needs to replace a commercial panorama engine.

### Viewer

- `createPanoViewer(container, { tour, … })` — a WebGL2 viewer with no runtime dependencies, safe to import during SSR.
- Equirectangular panoramas from one file (large images are split automatically) and cube panoramas from six faces, with an optional preview.
- Multiresolution cubes: a tile pyramid loaded level by level for the visible area, with a shared memory budget (`tileCacheMegabytes`) and fading tiles (`tileFadeMs`).
- Rectilinear projection, FOV modes and limits, view bounds, `project` / `unproject`.
- Drag, inertia, wheel, pinch and keyboard controls; `lookAt` camera animation with easing and cancellation.
- Your own `loader` (auth, proxies, caching) and `retry` policy for every image.
- A state snapshot with `subscribe` / `getSnapshot`, typed events and classified errors.

### Tours and transitions

- Tours are plain JSON validated by `validateTour`.
- `showScene` with cut, blend and move transitions, `view: 'keep'` and `keepMotion`; `preloadScene` and a scene cache in video memory; `setTour` without recreating the viewer.
- Scenes placed in a shared world (`position`, `heading`, `cameraHeight`): the move transition steps the camera toward a point with motion blur and turns the next room so the view keeps its direction.

### Hotspots

- Tour hotspots rendered as buttons or your own elements (`renderHotspot`), navigation to `target` with preloading on hover, keyboard access.
- Your own hotspots with `addHotspot` at sphere or world points, anchors and planes in perspective.
- Hotspot surfaces: pictures and videos drawn by WebGL in the hotspot's plane, covering each other by depth and fading with their scene, while the element stays the hit area.

### React

- `@dkukushkin/3d-pano/react`: `<PanoViewer>`, `usePanoViewer`, `<Hotspot>` and scene props, built on `subscribe` / `getSnapshot`.
