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

| Field     | Type   | Meaning                                                             |
| --------- | ------ | ------------------------------------------------------------------- |
| `id`      | string | Unique, non-empty.                                                  |
| `title`   | string | Optional human-readable name.                                       |
| `source`  | object | The panorama image, see [Sources](#sources).                        |
| `preview` | object | Optional small image of the same kinds, shown while `source` loads. |
| `view`    | object | Optional initial view, see [View](#view).                           |
| `limits`  | object | Optional camera limits, see [Limits](#limits).                      |

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

**URLs** may be `http:`, `https:`, `blob:`, `data:image/…` or relative. Any other scheme (`javascript:`, `file:` and so on) is rejected by `validateTour` before anything is loaded.

The string values have named constants with the same values — `EnumSourceType.Equirect`, `EnumSourceType.Cube`, `EnumCubeFace.Front` and so on. Strings and constants are interchangeable.

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

## Coordinates

The world uses X to the right, Y up and Z forward (the direction of `yaw` 0, `pitch` 0). A direction `{ x, y, z }` from the centre of the panorama and a sphere point `{ yaw, pitch }` describe the same thing:

```
x = sin(yaw) · cos(pitch)
y = sin(pitch)
z = cos(yaw) · cos(pitch)
```
