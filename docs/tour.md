# Tour format

A tour is plain JSON-compatible data: a list of scenes, the scene to start with and shared defaults. It contains no code, so it can come straight from a server response. Check untrusted data with `validateTour(value)` — it returns every problem at once as `{ path, message }`, and an empty array means the tour is valid.

```json
{
  "startScene": "room",
  "defaults": {
    "view": { "fov": 90, "fovMode": "max" },
    "limits": { "fov": [70, 140], "maxPixelZoom": 2, "bounds": "auto" }
  },
  "scenes": [
    {
      "id": "room",
      "title": "Hotel room",
      "source": { "type": "equirect", "url": "/panoramas/room.jpg" },
      "preview": { "type": "equirect", "url": "/panoramas/room-preview.jpg" },
      "view": { "yaw": 35, "pitch": -5 }
    },
    {
      "id": "kitchen",
      "source": {
        "type": "cube",
        "url": "https://cdn.example.com/tiles/kitchen/l1/{face}.jpg",
        "faceNames": { "front": "f", "right": "r", "back": "b", "left": "l", "up": "u", "down": "d" }
      }
    }
  ]
}
```

| Field        | Type   | Meaning                                                                          |
| ------------ | ------ | -------------------------------------------------------------------------------- |
| `scenes`     | array  | At least one scene. Scene ids must be unique.                                    |
| `startScene` | string | Id of the scene shown first. Defaults to the first scene in `scenes`.            |
| `defaults`   | object | `view` and `limits` shared by all scenes; a scene overrides them field by field. |

## Scenes

| Field      | Type   | Meaning                                                                                   |
| ---------- | ------ | ----------------------------------------------------------------------------------------- |
| `id`       | string | Unique, non-empty.                                                                        |
| `title`    | string | Optional human-readable name.                                                             |
| `source`   | object | The panorama image, see [Sources](#sources).                                              |
| `preview`  | object | Optional small image, shown while `source` loads. Any kind except a multiresolution cube. |
| `view`     | object | Optional initial view, see [View](#view).                                                 |
| `limits`   | object | Optional camera limits, see [Limits](#limits).                                            |
| `hotspots` | array  | Optional interactive points of the scene, see [Hotspots](#hotspots).                      |

## Sources

A scene shows either **one equirectangular file** or **six cube faces** — whichever you have, no conversion needed.

**Equirectangular** — a full 360°×180° sphere in one image, usually 2:1. The middle column is straight ahead (`yaw` 0), the left and right edges are behind (`yaw` ±180), the top row is the zenith and the bottom row is the nadir. Images larger than the device's maximum texture size are split into several textures automatically.

```json
{ "type": "equirect", "url": "/panoramas/balcony.jpg" }
```

**Cube** — six square faces of equal size loaded from one URL template. `{face}` is replaced with the face name; the default names are `front`, `right`, `back`, `left`, `up` and `down`, and `faceNames` renames any of them:

```json
{
  "type": "cube",
  "url": "/tiles/kitchen/{face}.jpg",
  "faceNames": { "front": "pz", "right": "px", "back": "nz", "left": "nx", "up": "py", "down": "ny" }
}
```

The centre of `front` is straight ahead, `right` is at `yaw` 90, `back` at 180 and `left` at −90. The bottom edge of `up` touches the top edge of `front`, and the top edge of `down` touches its bottom edge — the common layout produced by panorama stitching tools.

A cube with `tileSize` and `levels` is a [multiresolution cube](#multiresolution-cube): it is loaded in tiles, a little at a time.

**URLs** may be `http:`, `https:`, `blob:`, `data:image/…` or relative. Any other scheme (`javascript:`, `file:` and so on) is rejected by `validateTour` before anything is loaded.

The string values have named constants with the same values — `EnumSourceType.Equirect`, `EnumSourceType.Cube`, `EnumCubeFace.Front` and so on. Strings and constants are interchangeable.

## Multiresolution cube

A large panorama does not have to be downloaded whole before it appears. A multiresolution cube stores every face at several sizes, cut into square tiles. The viewer loads a small base first, then only the tiles in view, at the detail the screen actually needs, and keeps loading as the user turns and zooms.

```json
{
  "type": "cube",
  "url": "/tiles/kitchen/{level}/{face}/{row}_{col}.jpg",
  "faceNames": { "front": "f", "right": "r", "back": "b", "left": "l", "up": "u", "down": "d" },
  "tileSize": 512,
  "levels": [512, 1024, 2048, 4096]
}
```

| Field       | Type     | Meaning                                                                 |
| ----------- | -------- | ----------------------------------------------------------------------- |
| `url`       | string   | Template with `{level}`, `{face}`, `{row}` and `{col}`.                 |
| `tileSize`  | number   | Side of a tile in pixels.                                               |
| `levels`    | number[] | Face sizes in pixels, from the smallest level to the most detailed one. |
| `faceNames` | object   | Optional face names for `{face}`, as for a plain cube.                  |

In the template, `{level}` is the index in `levels` starting from 0, `{row}` counts tiles from the top of the face and `{col}` from its left, in the same face orientation as a plain cube. A level no larger than `tileSize` is a single tile `0_0` of the level's own size; a larger level is cut into `tileSize` squares. For the source above the files are:

```text
/tiles/kitchen/0/f/0_0.jpg              the whole 512 front face
/tiles/kitchen/1/f/0_0.jpg … 1_1.jpg    four 512 tiles of the 1024 face
/tiles/kitchen/2/f/0_0.jpg … 3_3.jpg    16 tiles of the 2048 face
/tiles/kitchen/3/f/0_0.jpg … 7_7.jpg    64 tiles of the 4096 face
```

How it loads:

- The smallest level is loaded whole and stays under everything else, so turning quickly never shows an empty area. Keep it small — 512 or less.
- The scene appears when the base and the tiles of the most detailed level needed for its first frame are loaded. After that, other tiles load in the background as the user looks around, from the centre of the view outwards; tiles that leave the view before they arrive are cancelled.
- The level is chosen for every pixel: the smallest level whose pixels are no larger than the screen's. `limits.maxPixelZoom` counts from the most detailed level, so the user can zoom in before its tiles arrive.
- Tiles of all scenes share one memory budget, `tileCacheMegabytes` in the [viewer options](api.md).

Doubling face sizes and 512-pixel tiles are a good default. `validateTour` requires `tileSize` and `levels` together; `tileSize` is an integer above 0; `levels` are 1 to 10 increasing integers above 0, each no larger than `tileSize` or a multiple of it, so every tile is full; `url` contains all four placeholders; every multiresolution scene of a tour uses the same `tileSize`; a `preview` cannot be a multiresolution cube.

## View

All angles are in degrees.

| Field     | Default | Meaning                                                                                                    |
| --------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| `yaw`     | `0`     | Horizontal direction; grows to the right. Any number, normalised to (−180, 180].                           |
| `pitch`   | `0`     | Vertical direction; grows upwards, from −90 (nadir) to 90 (zenith).                                        |
| `roll`    | `0`     | Tilt around the line of sight; a positive value tilts the horizon clockwise.                               |
| `fov`     | `90`    | Field of view, greater than 0 and less than 180.                                                           |
| `fovMode` | `max`   | Which side of the frame `fov` applies to: `horizontal`, `vertical`, `diagonal` or `max` (the longer side). |

Named constants: `EnumFovMode.Horizontal`, `EnumFovMode.Vertical`, `EnumFovMode.Diagonal`, `EnumFovMode.Max`.

## Limits

| Field          | Default     | Meaning                                                                         |
| -------------- | ----------- | ------------------------------------------------------------------------------- |
| `fov`          | `[30, 120]` | Minimum and maximum field of view in degrees, `0 < min <= max < 180`.           |
| `maxPixelZoom` | `2`         | Never zoom in further than this many CSS pixels per source pixel at the centre. |
| `bounds`       | `auto`      | `auto`, `none` or ranges `{ "yaw": [min, max], "pitch": [min, max] }`.          |

Named constants: `EnumBoundsMode.Auto`, `EnumBoundsMode.None`.

How the limits behave:

- **Field of view** is clamped to `fov` in the scene's `fovMode`.
- **Pixel zoom** is measured against the image that is currently loaded — the preview first, then the full source. It stops zooming _in_ once one source pixel would cover more than `maxPixelZoom` CSS pixels at the centre of the frame, and it never zooms out on its own: while a small preview is on screen the current field of view stays, it just cannot get narrower. When the full image arrives, zooming in is available again down to the `fov` minimum. For cube faces the density at the centre of a face is used, which is the most conservative point.
- **Bounds** `auto` and `none` behave the same for full spheres: `yaw` is free and the centre of the view stays within `pitch` −90…90. With ranges, the **whole frame** stays inside them: the view stops when its edge reaches the boundary, and if the frame is wider than a range, the field of view is reduced to fit. A `yaw` range may cross the back of the sphere, for example `[150, 210]`.

## Hotspots

A hotspot is a point of the scene with an element over the panorama: a door to the next room, a sign, a mark on the floor. In the tour it is plain data; the viewer draws a `<button>` with the `title` for it, or your own element (see [`renderHotspot`](api.md#hotspots)).

```json
{
  "id": "kitchen",
  "source": { "type": "equirect", "url": "/panoramas/kitchen.jpg" },
  "hotspots": [
    {
      "id": "to-bedroom",
      "position": { "x": 1.2, "y": -1.5, "z": 2.4 },
      "title": "Bedroom",
      "target": { "scene": "bedroom", "transition": { "type": "blend", "durationMs": 800 } },
      "plane": { "width": 0.5, "facing": { "yaw": 0, "pitch": 90 } }
    },
    {
      "id": "window",
      "position": { "yaw": 40, "pitch": 5 },
      "title": "Window",
      "anchor": "bottom",
      "data": { "icon": "info" }
    }
  ]
}
```

| Field      | Type   | Meaning                                                                                                                                                                                        |
| ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`       | string | Non-empty and unique within the scene; the same id may repeat in other scenes.                                                                                                                 |
| `position` | object | A sphere point `{ yaw, pitch }` or a world point `{ x, y, z }` relative to the centre of the panorama, see [Coordinates](#coordinates).                                                        |
| `title`    | string | Optional text of the default button and its accessible name. It is always shown as text, never as markup.                                                                                      |
| `target`   | object | Optional navigation: `{ scene, transition?, view?, keepMotion? }` — a scene of the tour and the same options as [`showScene`](api.md#scenes-and-transitions). Clicking the hotspot goes there. |
| `data`     | any    | Optional JSON of your own, passed as is to `renderHotspot` and to the hotspot events.                                                                                                          |
| `anchor`   | string | Which point of the element lies at `position`: `center` (default), `top`, `bottom`, `left`, `right`, `top-left`, `top-right`, `bottom-left` or `bottom-right` (`EnumHotspotAnchor`).           |
| `plane`    | object | Optional `{ width, facing?, spin? }` to lay the element in the world in perspective, see below.                                                                                                |

Without `plane` a hotspot keeps its size in pixels. With `plane` it lies in a plane of the world:

- `width` is the width of the element in world units; its height follows the element's CSS proportions. A sphere point counts as lying at distance 1, so `width: 0.2` is a fifth of that.
- `facing` is the direction its front side looks at, `{ yaw, pitch }` in degrees: `pitch` 90 lies on the floor facing up, `pitch` −90 hangs on the ceiling. Without `facing` the front side looks at the centre of the panorama, like a sign on a wall.
- The top of the element points up along the plane; on a horizontal plane it points away from the centre of the panorama, so text on the floor reads from where the camera stands. `spin` rotates it further within the plane, in degrees.

`validateTour` checks hotspots as strictly as the rest of the tour: a missing or repeated `id`, a non-finite or zero `position`, a `target.scene` that is not in the tour, invalid transition options, an unknown `anchor` or a `plane` without a positive `width` make the tour invalid, with the path of each problem (`scenes[2].hotspots[0].target.scene`).

## Coordinates

The world uses X to the right, Y up and Z forward (the direction of `yaw` 0, `pitch` 0). A direction `{ x, y, z }` from the centre of the panorama and a sphere point `{ yaw, pitch }` describe the same thing:

```
x = sin(yaw) · cos(pitch)
y = sin(pitch)
z = cos(yaw) · cos(pitch)
```
