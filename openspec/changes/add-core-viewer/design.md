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

| #   | Решение                                                                                                                               | Альтернативы                                         | Статус                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| D1  | Фабрика `createPanoViewer(container, options)` → объект-контроллер                                                                    | класс `new PanoViewer()`, `createPanorama()`         | согласовано                                              |
| D2  | События `on(name, handler)` + снимок `getSnapshot()`/`subscribe()`; вид в снимок не входит                                            | DOM-события на контейнере; только снимок             | согласовано                                              |
| D3  | На вход — сразу тур (`tour`), показывается стартовая сцена                                                                            | одна панорама, тур позже                             | согласовано                                              |
| D4  | Куб: `{ type: 'cube', url: '…{face}…', faceNames? }`; дискриминатор источников — `type`                                               | шесть явных URL; оба варианта                        | согласовано                                              |
| D5  | Эквиректангулярная: `{ type: 'equirect', url }`; превью — те же типы                                                                  | —                                                    | согласовано                                              |
| D6  | `view` и `limits` отдельно, общие — в `tour.defaults`, сцена переопределяет по полям                                                  | всё в одном `view`; ограничения — опция просмотрщика | согласовано                                              |
| D7  | Умолчания: `fov` 90, `fovMode` `max`, пределы FOV [30, 120], `maxPixelZoom` 2, `bounds` `auto`                                        | как в neometria (70–140); без ограничений            | согласовано                                              |
| D8  | Мышь — только режим «тянуть»                                                                                                          | оба режима                                           | согласовано                                              |
| D9  | React: `<PanoViewer>` + `usePanoViewer`, как ScrubVideo + useVideoScrubber                                                            | только хук; только компонент                         | согласовано                                              |
| D10 | Подмена загрузки функцией `loader({ url, signal })` → `Blob` или `ImageBitmap`                                                        | только `crossOrigin`/`resolveUrl`; не сейчас         | согласовано                                              |
| D11 | Один файл или грани — равноправно; большие изображения режутся автоматически уже в M1                                                 | только в M3                                          | согласовано                                              |
| D12 | Песочница: 8K-панорамы владельца локально (вне git), грани режет служебный скрипт песочницы на `sharp`                                | в браузере; файлы в git                              | согласовано                                              |
| D13 | Рендер — по пикселю: фрагментный шейдер строит луч и выбирает текстуру (см. ниже)                                                     | растеризация геометрии куба                          | согласовано (вариант «свой WebGL2» описывал этот подход) |
| D14 | Имена событий: `sceneLoadStart`, `sceneReady`, `viewChange`, `error`                                                                  | `sceneLoaded`, `load`, kebab-case                    | ждёт согласования                                        |
| D15 | Снимок: `{ sceneId, status: 'loading' \| 'ready' \| 'error', loadProgress, error }`                                                   | + `isInteracting`; статус `preview`                  | ждёт согласования                                        |
| D16 | Коды ошибок: `webgl-unavailable`, `invalid-tour`, `resource-failed`, `invalid-image`                                                  | общий `load-error`                                   | ждёт согласования                                        |
| D17 | `controls: { drag, wheel, pinch, keyboard, inertia }` — булевы, все `true` по умолчанию; скоростей и инверсии в M1 нет                | скорости и инверсия сразу                            | ждёт согласования                                        |
| D18 | `bounds`-объект держит внутри диапазонов весь кадр; если кадр шире диапазона — FOV уменьшается                                        | ограничивается только центр взгляда                  | ждёт согласования                                        |
| D19 | `maxPixelZoom` считается в CSS-пикселях (не в физических)                                                                             | физические пиксели                                   | ждёт согласования                                        |
| D20 | `roll` поддерживается в M1 (neometria не нужен, стоит одну строку математики)                                                         | убрать до этапа расширения                           | ждёт согласования                                        |
| D21 | `project` принимает и `{ yaw, pitch }`, и направление `{ x, y, z }` (для пинов neometria до хотспотов); `null` — только позади камеры | только `{ yaw, pitch }`; `null` и вне кадра          | ждёт согласования                                        |
| D22 | Повтор загрузки: 2 повтора с задержками 500 и 1500 мс                                                                                 | без повторов; настраиваемо                           | ждёт согласования                                        |
| D23 | Исключения обработчиков уходят в `reportError`                                                                                        | глотать; бросать                                     | ждёт согласования                                        |
| D24 | Корневой элемент: `role="application"`, `tabindex="0"`, `aria-label` = `label`; `label` обязателен                                    | `role="img"`; `label` необязателен                   | ждёт согласования                                        |
| D25 | Дети `<PanoViewer>` попадают в оверлей через портал после монтирования → peer-зависимость `react-dom` (необязательная, как `react`)   | дети рядом с canvas без портала                      | ждёт согласования                                        |
| D26 | Смена пропа `tour` в React в M1 пересоздаёт просмотрщик                                                                               | игнорировать до M2                                   | ждёт согласования                                        |
| D27 | Отдельный хук `usePanoSnapshot(viewer)` для пользователей компонента                                                                  | не добавлять                                         | ждёт согласования                                        |

### Контракт публичного API (M1)

```ts
export const createPanoViewer: (container: HTMLElement, options: IPanoViewerOptions) => IPanoViewer;
export const validateTour: (value: unknown) => ITourIssue[];

export interface IPanoViewerOptions {
  tour: ITour;
  label: string;
  loader?: TImageLoader;
  controls?: IControlsOptions;
  maxPixelRatio?: number;
  renderScale?: number;
}

export interface IPanoViewer {
  readonly overlay: HTMLElement;
  getView: () => IView;
  setView: (view: IViewSettings) => void;
  project: (point: ISpherePoint | IDirection) => IScreenPoint | null;
  unproject: (x: number, y: number) => ISpherePoint | null;
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
  type: 'equirect';
  url: string;
}
export interface ICubeSource {
  type: 'cube';
  url: string;
  faceNames?: Partial<Record<TCubeFace, string>>;
}
export type TCubeFace = 'front' | 'right' | 'back' | 'left' | 'up' | 'down';

export type TFovMode = 'horizontal' | 'vertical' | 'diagonal' | 'max';
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
  bounds?: 'auto' | 'none' | { yaw?: readonly [number, number]; pitch?: readonly [number, number] };
}

export interface IControlsOptions {
  drag?: boolean;
  wheel?: boolean;
  pinch?: boolean;
  keyboard?: boolean;
  inertia?: boolean;
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
export interface IScreenPoint {
  x: number;
  y: number;
}

export interface IPanoViewerSnapshot {
  sceneId: string | null;
  status: 'loading' | 'ready' | 'error';
  loadProgress: number;
  error: IPanoError | null;
}
export interface IPanoError {
  code: 'webgl-unavailable' | 'invalid-tour' | 'resource-failed' | 'invalid-image';
  message: string;
  url?: string;
  issues?: ITourIssue[];
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
export const usePanoViewer: (options: IPanoViewerOptions) => {
  containerRef: RefCallback<HTMLElement>;
  viewer: IPanoViewer | null;
  snapshot: IPanoViewerSnapshot;
};
```

`forwardRef` — чтобы проп `ref` работал и в React 18 (peer `react >= 18`, как в video-scrubber).

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

| Модуль                                                                             | Ответственность                                                                 | Чистый?                  |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------ |
| `math/angles.ts`                                                                   | градусы ↔ радианы, нормализация `yaw`, `clamp`                                  | да                       |
| `math/vector3.ts`                                                                  | операции над векторами                                                          | да                       |
| `math/camera-basis.ts`                                                             | базис и матрица камеры, направление по `yaw/pitch` и обратно                    | да                       |
| `math/field-of-view.ts`                                                            | режимы FOV → тангенсы половин углов по ширине и высоте                          | да                       |
| `math/rectilinear.ts`                                                              | экран ↔ направление (зеркало шага 1 шейдера)                                    | да                       |
| `math/cube-faces.ts`                                                               | направление ↔ грань и `(s, t)` (зеркало шага 2)                                 | да                       |
| `math/equirect.ts`                                                                 | направление ↔ `(u, v)` (зеркало шага 2)                                         | да                       |
| `tour/*`                                                                           | типы тура, умолчания и их наложение, шаблоны URL, проверка схем, `validateTour` | да                       |
| `view/view-limits.ts`                                                              | ограничения FOV, `maxPixelZoom`, `bounds`                                       | да                       |
| `controls/drag-gesture.ts`, `inertia.ts`, `pinch-gesture.ts`, `keyboard-motion.ts` | математика жестов                                                               | да                       |
| `controls/input-controller.ts`                                                     | слушатели Pointer Events, колеса, клавиатуры                                    | нет                      |
| `state/event-emitter.ts`, `state/snapshot-store.ts`                                | события и снимок                                                                | да (кроме `reportError`) |
| `resources/retry.ts`, `texture-split-plan.ts`, `load-progress.ts`                  | политика повтора, план нарезки, прогресс                                        | да                       |
| `resources/default-loader.ts`, `image-decoder.ts`, `scene-loader.ts`               | сеть, декодирование, загрузка сцены                                             | нет                      |
| `render/*`                                                                         | контекст, шейдеры, текстуры-массивы, слои, кадр, цикл по требованию             | нет                      |
| `dom/viewer-root.ts`, `dom/size-observer.ts`                                       | корневой элемент, доступность, размер и плотность                               | нет                      |
| `viewer/viewer-options.ts`                                                         | проверка и разрешение опций                                                     | да                       |
| `viewer/create-pano-viewer.ts`                                                     | сборка всего вместе                                                             | нет                      |
| `react/*`                                                                          | компонент, хуки                                                                 | нет                      |

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
- Жест начинается, только если цель события — canvas или сам оверлей; элементы хоста в оверлее получают
  свои события. `touch-action: none` на корне, пока включены перетаскивание или щипок.

### Цикл отрисовки

`requestRender()` ставит флаг и планирует один `requestAnimationFrame`. Инерция, клавиатура и загрузки
просят кадры, пока активны. Без изменений кадры не рисуются (конституция VI.1). `viewChange` отправляется
из кадра, поэтому не чаще одного раза за кадр.

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

Нет: всё, что меняет требования или задачи, вынесено в таблицу решений со статусом «ждёт согласования».
