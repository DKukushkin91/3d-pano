# Design

## Context

Репозиторий пустой: есть только каркас пакета (tsdown, oxlint/oxfmt, проверки) и правила проекта.
Мотивация и объём — в [proposal.md](./proposal.md), поведение — в дельтах `specs/`. Ограничения задают
[конституция](../../constitution.md) (чистая комната, ноль зависимостей ядра, читаемость, безопасность,
SDD) и шаблон пакета video-scrubber (фабрика + снимок/подписка, `'use client'` только в `/react`,
контракт-тесты `node --test` по `dist`).

## Goals / Non-Goals

**Goals:**

- Архитектура рендера, в которую без переделки ложатся следующие этапы: тайлы, нелинейные проекции,
  переходы, WebGL-поверхности.
- Чистая математика (углы, проекция, грани куба, ограничения, жесты, валидация) отделена от DOM и WebGL
  и полностью покрыта контракт-тестами.
- Одна и та же формула в GLSL и TypeScript — экранные координаты `project` совпадают с картинкой.

**Non-Goals:**

- Оптимизация под тысячи тайлов (это `add-multiresolution`).
- Обработка потери WebGL-контекста (этап форматов) — в M1 просмотрщик только не падает.

## Decisions

### Таблица решений

Все решения согласованы с владельцем 2026-10-01.

| #   | Решение                                                                                                                                                                                                                                                                                   | Альтернативы                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| D1  | Фабрика `createPanoViewer(container, options)` → объект-контроллер                                                                                                                                                                                                                        | класс `new PanoViewer()`, `createPanorama()`         |
| D2  | События `on(name, handler)` + снимок `getSnapshot()`/`subscribe()`; вид в снимок не входит                                                                                                                                                                                                | DOM-события на контейнере; только снимок             |
| D3  | На вход — сразу тур (`tour`), показывается стартовая сцена                                                                                                                                                                                                                                | одна панорама, тур позже                             |
| D4  | Куб: `{ type: 'cube', url: '…{face}…', faceNames? }`; дискриминатор источников — `type`                                                                                                                                                                                                   | шесть явных URL; оба варианта                        |
| D5  | Эквиректангулярная: `{ type: 'equirect', url }`; превью — те же типы                                                                                                                                                                                                                      | —                                                    |
| D6  | `view` и `limits` отдельно, общие — в `tour.defaults`, сцена переопределяет по полям                                                                                                                                                                                                      | всё в одном `view`; ограничения — опция просмотрщика |
| D7  | Умолчания: `fov` 90, `fovMode` `max`, пределы FOV [30, 120], `maxPixelZoom` 2, `bounds` `auto`                                                                                                                                                                                            | как в neometria (70–140); без ограничений            |
| D8  | Мышь — только режим «тянуть»                                                                                                                                                                                                                                                              | оба режима                                           |
| D9  | React: `<PanoViewer>` + `usePanoViewer`, как ScrubVideo + useVideoScrubber                                                                                                                                                                                                                | только хук; только компонент                         |
| D10 | Подмена загрузки функцией `loader({ url, signal })` → `Blob` или `ImageBitmap`                                                                                                                                                                                                            | только `crossOrigin`/`resolveUrl`; не сейчас         |
| D11 | Один файл или грани — равноправно; большие изображения режутся автоматически уже в M1                                                                                                                                                                                                     | только в M3                                          |
| D12 | Песочница: 8K-панорамы владельца локально (вне git), грани режет служебный скрипт песочницы на `sharp`                                                                                                                                                                                    | в браузере; файлы в git                              |
| D13 | Рендер — по пикселю: фрагментный шейдер строит луч и выбирает текстуру (см. ниже)                                                                                                                                                                                                         | растеризация геометрии куба                          |
| D14 | События в camelCase: `sceneLoadStart`, `sceneReady`, `viewChange`, `error`                                                                                                                                                                                                                | kebab-case; слитно, как DOM                          |
| D15 | Снимок: `{ sceneId, status, loadProgress, isInteracting, error }`, статусы `loading`, `preview`, `ready`, `error`                                                                                                                                                                         | без `isInteracting`; без статуса превью              |
| D16 | Ошибка: `{ category, code, message, url?, httpStatus?, issues?, cause? }`. Категории (`webgl`, `tour`, `resource`, `image`) задают действие хоста, коды уточняют: `webgl-unavailable`, `invalid-tour`, `network-failed`, `http-status`, `decode-failed`, `loader-failed`, `invalid-image` | четыре кода без категорий; три кода                  |
| D17 | `controls`: `drag`, `wheel`, `pinch`, `keyboard`, `inertia` (вкл/выкл), `wheelSpeed`, `keyboardSpeed`, `inertiaFriction` (множители, по умолчанию 1), `invertDrag`                                                                                                                        | только вкл/выкл                                      |
| D18 | `bounds`-объект держит внутри диапазонов весь кадр; если кадр шире диапазона — FOV уменьшается                                                                                                                                                                                            | только центр взгляда; оба режима                     |
| D19 | `maxPixelZoom` считается в CSS-пикселях                                                                                                                                                                                                                                                   | физические пиксели                                   |
| D20 | `roll` есть в M1                                                                                                                                                                                                                                                                          | позже, с гироскопом                                  |
| D21 | `project` принимает `{ yaw, pitch }` или направление `{ x, y, z }`, возвращает `{ x, y, isInView }`; `null` — только позади камеры                                                                                                                                                        | без флага видимости; только `{ yaw, pitch }`         |
| D22 | Повтор загрузки по опции `retry: { attempts, delayMs }`, по умолчанию 2 повтора с 500 мс и ростом ×3; ответы 4xx и отменённые загрузки не повторяются; `attempts: 0` — без повторов                                                                                                       | жёстко; без повторов                                 |
| D23 | Исключения обработчиков уходят в `reportError`, работа продолжается                                                                                                                                                                                                                       | не ловить                                            |
| D24 | Корень: `role="application"`, `tabindex="0"`, `aria-label` = `label`; `label` обязателен                                                                                                                                                                                                  | `role="img"`; роль задаёт хост                       |
| D25 | Дети `<PanoViewer>` попадают в оверлей через портал после монтирования; `react-dom` — необязательная peer-зависимость                                                                                                                                                                     | дети рядом с canvas без портала                      |
| D26 | Смена пропа `tour` в React в M1 пересоздаёт просмотрщик                                                                                                                                                                                                                                   | игнорировать до M2                                   |
| D27 | Хук `usePanoSnapshot(viewer)`                                                                                                                                                                                                                                                             | не добавлять                                         |
| D28 | Перечисления — словари `as const` с префиксом `Enum` и производным типом `T…` во всём коде; строки принимаются наравне с константами; `enum` и `const enum` не используются                                                                                                               | `const enum` внутри; обычные `enum`                  |
| D29 | `viewer.retry()` повторно запрашивает незагруженные изображения текущей сцены, сохраняя вид и загруженное                                                                                                                                                                                 | пересоздание просмотрщика; ждать M2                  |

### Контракт публичного API (M1)

Словари (каждый экспортируется вместе с типом `T…` из своих значений):

```ts
export const EnumSourceType = { Equirect: 'equirect', Cube: 'cube' } as const;
export const EnumCubeFace = {
  Front: 'front',
  Right: 'right',
  Back: 'back',
  Left: 'left',
  Up: 'up',
  Down: 'down',
} as const;
export const EnumFovMode = {
  Horizontal: 'horizontal',
  Vertical: 'vertical',
  Diagonal: 'diagonal',
  Max: 'max',
} as const;
export const EnumBoundsMode = { Auto: 'auto', None: 'none' } as const;
export const EnumViewerStatus = {
  Loading: 'loading',
  Preview: 'preview',
  Ready: 'ready',
  Error: 'error',
} as const;
export const EnumErrorCategory = {
  Webgl: 'webgl',
  Tour: 'tour',
  Resource: 'resource',
  Image: 'image',
} as const;
export const EnumErrorCode = {
  WebglUnavailable: 'webgl-unavailable',
  InvalidTour: 'invalid-tour',
  NetworkFailed: 'network-failed',
  HttpStatus: 'http-status',
  DecodeFailed: 'decode-failed',
  LoaderFailed: 'loader-failed',
  InvalidImage: 'invalid-image',
} as const;

export type TSourceType = (typeof EnumSourceType)[keyof typeof EnumSourceType];
```

Ядро:

```ts
export const createPanoViewer: (container: HTMLElement, options: IPanoViewerOptions) => IPanoViewer;
export const validateTour: (value: unknown) => ITourIssue[];

export interface IPanoViewerOptions {
  tour: ITour;
  label: string;
  loader?: TImageLoader;
  retry?: IRetryOptions;
  controls?: IControlsOptions;
  maxPixelRatio?: number;
  renderScale?: number;
}

export interface IPanoViewer {
  readonly overlay: HTMLElement;
  getView: () => IView;
  setView: (view: IViewSettings) => void;
  project: (point: ISpherePoint | IDirection) => IProjectedPoint | null;
  unproject: (x: number, y: number) => ISpherePoint | null;
  retry: () => Promise<void>;
  update: (options: Partial<Omit<IPanoViewerOptions, 'tour'>>) => void;
  on: <TName extends keyof IPanoViewerEventMap>(
    name: TName,
    handler: (payload: IPanoViewerEventMap[TName]) => void,
  ) => () => void;
  getSnapshot: () => IPanoViewerSnapshot;
  subscribe: (listener: () => void) => () => void;
  destroy: () => void;
}

export interface ITour {
  startScene?: string;
  defaults?: { view?: IViewSettings; limits?: IViewLimits };
  scenes: IScene[];
}

export interface IScene {
  id: string;
  title?: string;
  source: TPanoramaSource;
  preview?: TPanoramaSource;
  view?: IViewSettings;
  limits?: IViewLimits;
}

export type TPanoramaSource = IEquirectSource | ICubeSource;
export interface IEquirectSource {
  type: typeof EnumSourceType.Equirect;
  url: string;
}
export interface ICubeSource {
  type: typeof EnumSourceType.Cube;
  url: string;
  faceNames?: Partial<Record<TCubeFace, string>>;
}

export interface IViewSettings {
  yaw?: number;
  pitch?: number;
  roll?: number;
  fov?: number;
  fovMode?: TFovMode;
}
export interface IView {
  yaw: number;
  pitch: number;
  roll: number;
  fov: number;
  fovMode: TFovMode;
}
export interface IViewLimits {
  fov?: readonly [number, number];
  maxPixelZoom?: number;
  bounds?: TBoundsMode | { yaw?: readonly [number, number]; pitch?: readonly [number, number] };
}

export interface IControlsOptions {
  drag?: boolean;
  wheel?: boolean;
  pinch?: boolean;
  keyboard?: boolean;
  inertia?: boolean;
  wheelSpeed?: number;
  keyboardSpeed?: number;
  inertiaFriction?: number;
  invertDrag?: boolean;
}
export interface IRetryOptions {
  attempts?: number;
  delayMs?: number;
}
export type TImageLoader = (request: { url: string; signal: AbortSignal }) => Promise<Blob | ImageBitmap>;

export interface ISpherePoint {
  yaw: number;
  pitch: number;
}
export interface IDirection {
  x: number;
  y: number;
  z: number;
}
export interface IProjectedPoint {
  x: number;
  y: number;
  isInView: boolean;
}

export interface IPanoViewerSnapshot {
  sceneId: string | null;
  status: TViewerStatus;
  loadProgress: number;
  isInteracting: boolean;
  error: IPanoError | null;
}
export interface IPanoError {
  category: TErrorCategory;
  code: TErrorCode;
  message: string;
  url?: string;
  httpStatus?: number;
  issues?: ITourIssue[];
  cause?: unknown;
}
export interface ITourIssue {
  path: string;
  message: string;
}

export interface IPanoViewerEventMap {
  sceneLoadStart: { sceneId: string };
  sceneReady: { sceneId: string };
  viewChange: { view: IView };
  error: { error: IPanoError };
}
```

React (`@dkukushkin/3d-pano/react`):

```ts
export interface IPanoViewerProps extends IPanoViewerOptions {
  className?: string;
  children?: ReactNode;
  onSceneLoadStart?: (payload: { sceneId: string }) => void;
  onSceneReady?: (payload: { sceneId: string }) => void;
  onViewChange?: (payload: { view: IView }) => void;
  onError?: (payload: { error: IPanoError }) => void;
}
export const PanoViewer: ForwardRefExoticComponent<IPanoViewerProps & RefAttributes<IPanoViewer | null>>;
export interface IUsePanoViewerOptions extends IPanoViewerOptions, IPanoViewerEventProps {}
export const usePanoViewer: (options: IUsePanoViewerOptions) => {
  containerRef: RefCallback<HTMLElement>;
  viewer: IPanoViewer | null;
  snapshot: IPanoViewerSnapshot;
};
export const usePanoSnapshot: (viewer: IPanoViewer | null) => IPanoViewerSnapshot;
```

`forwardRef` — чтобы проп `ref` работал и в React 18 (peer `react >= 18`, как в video-scrubber).
`usePanoSnapshot(null)` возвращает начальный снимок (`status: 'loading'`), чтобы хук можно было вызывать
до монтирования.

### Координаты

- Публичные углы в градусах, внутри — радианы; перевод только в `math/angles.ts`.
- Мир: X — вправо, Y — вверх, Z — вперёд. Направление взгляда:
  `direction(yaw, pitch) = (sin yaw · cos pitch, sin pitch, cos yaw · cos pitch)`.
- Камера: базис `right`, `up`, `forward` из `yaw`, `pitch`, `roll`; матрица камера → мир передаётся в шейдер
  как `mat3`.
- Эквиректангулярные координаты: `u = yaw / 2π + 0.5`, `v = 0.5 − pitch / π`, `v = 0` — верхняя строка.
- Грани куба (как в `scripts/lib/equirect-to-cube.mjs` neometria, пиксель `(s, t)` грани в [−1, 1], `t`
  растёт вниз): `front (s, −t, 1)`, `back (−s, −t, −1)`, `left (−1, −t, s)`, `right (1, −t, −s)`,
  `up (s, 1, t)`, `down (s, −1, −t)`.

### Рендер: луч на пиксель

Каждый кадр — один полноэкранный треугольник на слой. Фрагментный шейдер:

1. переводит пиксель в луч камеры прямолинейной проекцией:
   `ray = normalize((ndc.x · tanHalfWidth, ndc.y · tanHalfHeight, 1))`, затем в мир матрицей камеры;
2. по направлению находит координаты в источнике (эквиректангулярные `u, v` или грань куба и `s, t`);
3. выбирает слой `sampler2DArray` (тайл) и читает его `textureLod` с аналитическим уровнем MIP:
   `lod = log2(углового размера пикселя / углового размера текселя)`, где угловой размер пикселя —
   `length(fwidth(direction))`. Производная направления непрерывна, поэтому на шве `u = 0/1` и на рёбрах
   граней нет полос, которые даёт обычный `texture()`.

Почему так, а не растеризация куба: та же схема без изменений принимает нелинейные проекции (меняется
только шаг 1), частичные и цилиндрические источники (шаг 2) и переходы (несколько слоёв). Цена —
работа фрагментного шейдера на каждый пиксель, но это одна выборка текстуры на слой.

Слои кадра: превью, затем основной источник. Основной слой отбрасывает пиксели ещё не загруженных
тайлов по битовой маске готовности (`uint`, до 32 тайлов в M1), поэтому грани проявляются по мере
загрузки поверх превью.

### Нарезка больших изображений

Чистая функция `planTextureSplit(width, height, maxTextureSize)` возвращает сетку тайлов одинакового
размера (последний ряд и столбец могут быть не заполнены до края). Тайлы — слои одной
`TEXTURE_2D_ARRAY`; вырезаются `createImageBitmap(bitmap, sx, sy, sw, sh)`. Эквиректангулярный источник
из одного тайла использует повтор по горизонтали (`REPEAT`), чтобы шов ±180 фильтровался правильно.
Куб с гранями больше лимита режет каждую грань на k×k тайлов.

### Модули

| Модуль                                                                              | Ответственность                                                                 | Чистый?                  |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------ |
| `math/angles.ts`                                                                    | градусы ↔ радианы, нормализация `yaw`, `clamp`                                  | да                       |
| `math/vector3.ts`                                                                   | операции над векторами                                                          | да                       |
| `math/camera-basis.ts`                                                              | базис и матрица камеры, направление по `yaw/pitch` и обратно                    | да                       |
| `math/field-of-view.ts`                                                             | режимы FOV → тангенсы половин углов по ширине и высоте                          | да                       |
| `math/rectilinear.ts`                                                               | экран ↔ направление (зеркало шага 1 шейдера)                                    | да                       |
| `math/cube-faces.ts`                                                                | направление ↔ грань и `(s, t)` (зеркало шага 2)                                 | да                       |
| `math/equirect.ts`                                                                  | направление ↔ `(u, v)` (зеркало шага 2)                                         | да                       |
| `tour/tour-dictionaries.ts`, `state/viewer-dictionaries.ts`                         | словари `Enum…` и производные типы `T…`                                         | да                       |
| `tour/*`                                                                            | типы тура, умолчания и их наложение, шаблоны URL, проверка схем, `validateTour` | да                       |
| `view/view-limits.ts`                                                               | ограничения FOV, `maxPixelZoom`, `bounds`                                       | да                       |
| `controls/drag-gesture.ts`, `inertia.ts`, `pinch-gesture.ts`, `keyboard-motion.ts`  | математика жестов                                                               | да                       |
| `controls/input-controller.ts`                                                      | слушатели Pointer Events, колеса, клавиатуры                                    | нет                      |
| `state/event-emitter.ts`, `state/snapshot-store.ts`                                 | события и снимок                                                                | да (кроме `reportError`) |
| `resources/retry.ts`, `texture-split-plan.ts`, `load-progress.ts`, `load-errors.ts` | политика повтора, план нарезки, прогресс, категории и коды ошибок загрузки      | да                       |
| `resources/default-loader.ts`, `image-decoder.ts`, `scene-loader.ts`                | сеть, декодирование, загрузка сцены                                             | нет                      |
| `render/*`                                                                          | контекст, шейдеры, текстуры-массивы, слои, кадр, цикл по требованию             | нет                      |
| `dom/viewer-root.ts`, `dom/size-observer.ts`                                        | корневой элемент, доступность, размер и плотность                               | нет                      |
| `viewer/viewer-options.ts`                                                          | проверка и разрешение опций                                                     | да                       |
| `viewer/create-pano-viewer.ts`                                                      | сборка всего вместе                                                             | нет                      |
| `react/*`                                                                           | компонент, хуки                                                                 | нет                      |

Формулы, живущие и в GLSL, и в TypeScript: `direction(yaw, pitch)`, луч прямолинейной проекции, грани
куба, эквиректангулярные `u, v`. В шейдере функции называются так же, как в TS; TS-версии покрыты
контракт-тестами, а песочница сверяет `project` с картинкой.

### Управление

- Перетаскивание: при нажатии запоминаются вид и точка сферы под указателем; при движении новый вид =
  стартовый + разность `unproject` стартовой и текущей точки, посчитанных для стартового вида. Точно в
  центре кадра, без накопления ошибки.
- Инерция: угловая скорость по последним ~100 мс движения; затухание `v · exp(−k · dt)`; остановка ниже
  порога. Константы подбираются в песочнице и фиксируются именованными константами.
- Колесо: `tan(fov/2)` умножается на `2^(Δ · k)`; `deltaMode` строк и страниц приводится к пикселям.
- Щипок: `tan(fov/2) = tan(fov₀/2) · d₀ / d`.
- Клавиатура: нажатые клавиши задают целевую угловую скорость с разгоном и торможением.
- `wheelSpeed`, `keyboardSpeed`, `inertiaFriction` — множители к именованным константам по умолчанию;
  `invertDrag` меняет знак смещения перетаскивания, клавиатура не инвертируется.
- `isInteracting` — `true` от нажатия до отпускания указателя и пока зажаты клавиши; инерция
  взаимодействием не считается.
- Жест начинается, только если цель события — canvas или сам оверлей; элементы хоста в оверлее получают
  свои события. `touch-action: none` на корне, пока включены перетаскивание или щипок.

### Цикл отрисовки

`requestRender()` ставит флаг и планирует один `requestAnimationFrame`. Инерция, клавиатура и загрузки
просят кадры, пока активны. Без изменений кадры не рисуются (конституция VI.1). `viewChange` отправляется
из кадра, поэтому не чаще одного раза за кадр.

### Решения, принятые при реализации

Мелкие решения внутри согласованного дизайна (AGENTS.md, правило 1). Владелец может пересмотреть любое.

| #   | Решение                                                                                                                                                           | Почему                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| R1  | `maxPixelZoom` не даёт приближать дальше, но не отдаляет камеру сам                                                                                               | иначе показ маленького превью рывком менял бы начальный вид                                                               |
| R2  | `setView` с нечисловым углом или неизвестным `fovMode` бросает `RangeError`                                                                                       | это ошибка программиста хоста, как неверная опция                                                                         |
| R3  | `controls` и `retry` в `update()` заменяются целиком, недостающие поля — умолчания                                                                                | так же ведут себя React-пропсы, без «памяти» о прошлых значениях                                                          |
| R4  | `retry()` ничего не делает, если ошибка не категории `resource` или просмотрщик уничтожен; при новой ошибке отклоняется исключением с полем `details: IPanoError` | ошибка уже есть в снимке и событии, промис нужен для кнопки                                                               |
| R5  | Первый кадр отправляет `viewChange` с начальным видом                                                                                                             | хост узнаёт вид без отдельного запроса                                                                                    |
| R6  | Битые файлы (`decode-failed`) не повторяются, сбои загрузчика хоста — повторяются                                                                                 | декодирование тех же байтов даст ту же ошибку, а природа сбоя хоста неизвестна                                            |
| R7  | Сбой загрузки изображения в видеопамять — ошибка `decode-failed` с URL                                                                                            | категория `resource` предлагает «Повторить», что честно для этого случая                                                  |
| R8  | Статус `preview` — когда превью загружено целиком; без превью статус остаётся `loading` до `ready`                                                                | буквально по спецификации «видно превью»                                                                                  |
| R9  | Точка входа `/react` убрана из `exports` до группы 9                                                                                                              | oxlint не пропускает пустой модуль                                                                                        |
| R10 | Песочница отдаёт экземпляр в `window.playgroundViewer` и берёт служебную `createViewer` при `?maxTextureSize`                                                     | сценарии проверяются из консоли встроенного браузера                                                                      |
| R11 | Курсор `grab`/`grabbing`, пока включено перетаскивание; `user-select: none` только на время жеста                                                                 | стандартная подсказка, что панораму можно тянуть, и без выделения текста оверлея при жесте                                |
| R12 | Первый кадр после покоя длится 1/60 с; отпускание клавиши, не прошедшей ни одного кадра, применяется после кадра                                                  | иначе короткое нажатие стрелки ничего не делало                                                                           |
| R13 | Перетаскивание переводит смещение указателя в углы относительно осей камеры, а не в разность мировых `yaw`/`pitch`                                                | ошибка, найденная владельцем: у надира и зенита камера крутилась по кругу; требование «Перетаскивание» уточнено           |
| R14 | `update()` с теми же значениями ничего не делает; React-хук передаёт опции после каждого рендера                                                                  | `controls` и `retry` можно писать прямо в JSX без лишних кадров                                                           |
| R15 | Компонент подписывается на события в том же эффекте, где создаёт просмотрщик                                                                                      | ошибка, найденная в песочнице: события стартовой сцены уходили раньше следующего эффекта, `onSceneLoadStart` не вызывался |

## Risks / Trade-offs

- [8K эквиректангулярная занимает ~170 МБ видеопамяти с MIP] → на слабых телефонах возможна нехватка
  памяти. Смягчение сейчас — превью и документированная рекомендация давать грани; в M4 — тайлы по
  уровням. Если подтвердится на реальных устройствах — отдельное изменение с опцией понижения
  разрешения.
- [Швы на границах тайлов нарезки при билинейной фильтрации — до полупикселя] → на фото незаметно;
  если станет заметно — перекрытие тайлов на 1–2 пикселя.
- [Аналитический MIP чуть размывает углы граней куба при отдалении] → формула учитывает плотность
  текселей `1 / (1 + s² + t²)`; остаток проверяется в песочнице.
- [`createImageBitmap` с вырезанием декодирует изображение целиком] → пик памяти при загрузке 8K; приемлемо
  для M1, учитывается в M4.
- [Полноэкранный проход на слой на экранах 3×] → `maxPixelRatio` 2 по умолчанию.

## Migration Plan

Новый пакет, мигрировать нечего. Переезд neometria начнётся после `add-scene-navigation`,
`add-hotspots` и `add-multiresolution`.

## Open Questions

Нет: все решения, влияющие на требования и задачи, согласованы и перечислены в таблице решений.
