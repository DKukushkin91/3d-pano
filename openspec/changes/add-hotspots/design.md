# Design

## Context

- Оверлей. Просмотрщик уже создаёт оверлей над canvas для интерфейса хоста. Нажатие на его потомков не
  начинает жест (`pointer-gestures`), а React-дети `<PanoViewer>` рендерятся в него порталом.
- `project`. Камера (`viewer/camera-state.ts`) умеет переводить точку в пиксели через
  `screenFromDirection`; хост вызывает её сам, в своём цикле кадров.
- Кадр отрисовки — по требованию. `renderFrame` по очереди:
  - шагает ввод и поворот;
  - рисует кадр навигатора;
  - отправляет `viewChange`, если `camera.takeViewChange()` сообщил об изменении вида.
- Навигатор при появлении сцены вызывает `host.present({ view, limits, pixelsPerRadian, keepMotion })`
  без самой сцены. При `setTour` с той же сценой на экране он вызывает только
  `host.applyLimits(limits)`.
- `create-pano-viewer.ts` занимает 259 строк из 300, хотспоты в него не поместятся.

Мотивация и объём — в [proposal.md](./proposal.md), поведение — в дельтах `specs/`.

## Goals / Non-Goals

**Goals:**

- Решения о хотспотах проверяются контракт-тестами в Node без DOM — это чистые функции:
  - разрешение хотспотов сцены;
  - проекция точки и плоскости;
  - видимость и порядок наложения;
  - вход и уход;
  - проверка аргументов.
- В кадре, где ничего не изменилось, слой хотспотов не трогает DOM. В кадре с изменениями он не читает
  раскладку: размеры элементов приходят из `ResizeObserver`, и только у хотспотов в плоскости.
- Стили и атрибуты элементов хоста не меняются: всё положение — у контейнеров библиотеки.

**Non-Goals:**

- Учёт глубины, WebGL-поверхности и переход-движение к точке (M5).
- Своё оформление и анимации хотспотов: это CSS хоста по data-атрибутам.

## Decisions

### Таблица решений

Нумерация продолжает D66–D87 из `add-camera-motion`.

| #    | Решение                                                                                                                                                                                                                                                                                                                    | Альтернативы                                                                                                 | Статус                 |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------- |
| D88  | Хотспоты объявляются и в туре (данные), и через API хоста (свои элементы)                                                                                                                                                                                                                                                  | только API хоста; только тур                                                                                 | согласовано 2026-10-02 |
| D89  | Всё в одном изменении `add-hotspots`                                                                                                                                                                                                                                                                                       | два изменения (слой и тур); три                                                                              | согласовано 2026-10-02 |
| D90  | Хотспот тура: `{ id, position, title?, target?, data? }`, `position` — `TViewTarget`, `target` — сцена и опции `showScene`, `data` — произвольный JSON                                                                                                                                                                     | плоские поля; виды по `type`                                                                                 | согласовано 2026-10-02 |
| D91  | Клик по хотспоту с `target` → `hotspotClick` → `showScene(target)`, если не вызван `preventDefault()`; наведение и фокус → `preloadScene(target.scene)`                                                                                                                                                                    | только событие; переход без отмены                                                                           | согласовано 2026-10-02 |
| D92  | Элемент хотспота тура — `<button>` с `title` по умолчанию или результат `renderHotspot` хоста; в React — `ReactNode`                                                                                                                                                                                                       | только кнопка; только `renderHotspot`                                                                        | согласовано 2026-10-02 |
| D93  | Хотспоты хоста: `viewer.addHotspot({ element, position, scene? })` и React `<Hotspot position scene>`                                                                                                                                                                                                                      | `setHotspots` списком; только `addHotspot`                                                                   | согласовано 2026-10-02 |
| D94  | Плоскость: `plane: { width, facing?, spin? }` — ширина в единицах мира, направление лицевой стороны в градусах API (по умолчанию — к центру), поворот в плоскости                                                                                                                                                          | готовые ориентации; `rotateX/Y/Z` как в CSS                                                                  | согласовано 2026-10-02 |
| D95  | Якорь: по умолчанию центр, опция `anchor` из девяти положений                                                                                                                                                                                                                                                              | всегда центр; левый верхний угол                                                                             | согласовано 2026-10-02 |
| D96  | События `hotspotClick` (с `preventDefault()`), `hotspotEnter`, `hotspotLeave` — только для хотспотов тура; вход — наведение или фокус                                                                                                                                                                                      | события и для хотспотов хоста; только клик и опция отключения навигации                                      | согласовано 2026-10-02 |
| D97  | Хотспоты сцены видны, пока сцена на экране; смена — в момент появления новой сцены                                                                                                                                                                                                                                         | растворение по весу смешивания; с момента вызова `showScene`                                                 | согласовано 2026-10-02 |
| D98  | `validateTour` проверяет хотспоты строго; `id` обязателен и уникален в сцене                                                                                                                                                                                                                                               | пропускать плохие хотспоты; `id` по индексу                                                                  | согласовано 2026-10-02 |
| D99  | Хотспоты вне кадра и позади камеры остаются в порядке Tab; фокус с клавиатуры на таком хотспоте поворачивает к нему камеру                                                                                                                                                                                                 | вне кадра скрыты и не фокусируются; ничего особого до M6                                                     | согласовано 2026-10-02 |
| D100 | Новая возможность `hotspots`; в `tour-config` меняется «Структура тура» и добавляется «Валидация хотспотов»; меняются «Типизированные события» и «Обработчики событий как пропсы»; в `react-adapter` добавляются `renderHotspot` и `<Hotspot>`. `viewer-lifecycle` не меняется: опция `renderHotspot` описана в `hotspots` | дополнить «Проверку опций» и «Обновление опций» `viewer-lifecycle`                                           | согласовано 2026-10-02 |
| D101 | Имена: `IHotspot` (хотспот тура), `IHotspotTarget` (`IShowSceneOptions` + `scene`), `IHotspotPlane`, `EnumHotspotAnchor`/`THotspotAnchor`, `IAddHotspotOptions`, `IHotspotHandle`, `IHotspotRenderContext`; React — `Hotspot` и `IHotspotProps`                                                                            | `ITourHotspot`, `INavigationTarget`                                                                          | согласовано 2026-10-02 |
| D102 | Объект хотспота хоста — `{ setPosition, setScene, setAnchor, setPlane, remove }`: по сеттеру на поле, `undefined` возвращает умолчание                                                                                                                                                                                     | `update(changes)` + `remove()`; `setPosition` + пересоздание при смене остальных полей                       | согласовано 2026-10-02 |
| D103 | `renderHotspot(hotspot, { sceneId, signal })`: `signal` отменяется, когда элемент убран — так хост и React-адаптер освобождают своё                                                                                                                                                                                        | отдельный колбэк освобождения; без уведомления                                                               | согласовано 2026-10-02 |
| D104 | `renderHotspot` можно сменить через `update()`: видимые хотспоты тура перерисовываются, `undefined` возвращает кнопку по умолчанию; не функция — `TypeError`                                                                                                                                                               | только при создании просмотрщика                                                                             | согласовано 2026-10-02 |
| D105 | Хотспот позади камеры: у контейнера `opacity: 0` и `pointer-events: none`, фокус остаётся. Атрибуты контейнера: `data-pano-hotspot` (у хотспота тура — его `id`) и `data-pano-visible="true"`/`"false"`; у кнопки по умолчанию — `data-pano-hotspot-button`                                                                | `visibility: hidden` (выпадает из Tab); без атрибутов                                                        | согласовано 2026-10-02 |
| D106 | Хотспоты сцен, которых нет на экране, не лежат в DOM и не фокусируются                                                                                                                                                                                                                                                     | лежат скрытыми                                                                                               | согласовано 2026-10-02 |
| D107 | Порядок наложения — по расстоянию до камеры, ближний сверху; у точки сферы расстояние 1; при равенстве — порядок добавления (сначала тур, затем хост)                                                                                                                                                                      | порядок добавления; `z-index` хоста                                                                          | согласовано 2026-10-02 |
| D108 | Хотспот в плоскости скрыт, пока хоть один его угол позади камеры, и пока размер его элемента не известен                                                                                                                                                                                                                   | обрезать по ближней плоскости; скрывать по центру                                                            | согласовано 2026-10-02 |
| D109 | Корень просмотрщика — `overflow: clip` вместо `hidden`: фокус на элементе за краем не прокручивает корень                                                                                                                                                                                                                  | сбрасывать `scrollLeft/Top` по событию `scroll`                                                              | согласовано 2026-10-02 |
| D110 | «Фокус с клавиатуры» — фокус, при котором элемент совпадает с `:focus-visible`. «Вне кадра» — проекция точки `position` позади камеры или за краем контейнера                                                                                                                                                              | любой фокус; по пересечению прямоугольника элемента с кадром                                                 | согласовано 2026-10-02 |
| D111 | Предзагрузка запускается при каждом входе в хотспот; её отклонение глотается, повтор уже готовой сцены ничего не стоит (кэш)                                                                                                                                                                                               | один раз за показ сцены                                                                                      | согласовано 2026-10-02 |
| D112 | Доступное имя кнопки по умолчанию: `title`; без него — `aria-label` из `title` целевой сцены, затем её `id`, а у хотспота без `target` — его `id`                                                                                                                                                                          | пустая кнопка; `title` обязателен                                                                            | согласовано 2026-10-02 |
| D113 | Точка сферы как `position` хотспота в плоскости лежит на расстоянии 1, `width` — в тех же единицах                                                                                                                                                                                                                         | плоскость только для точек мира                                                                              | согласовано 2026-10-02 |
| D114 | Верх элемента в плоскости смотрит вверх по плоскости (проекция мировой вертикали); у горизонтальной плоскости — от центра панорамы, чтобы надпись читалась с места камеры, а точно под или над камерой — в сторону `facing.yaw`. `spin` доворачивает по часовой при взгляде на лицевую сторону                             | верх горизонтальной плоскости в сторону `facing.yaw`; как у таблички, наклонённой назад (`facing.yaw + 180`) | согласовано 2026-10-02 |
| D115 | React `renderHotspot(hotspot, sceneId) → ReactNode`; портал в элемент, который адаптер отдаёт ядру. Появление и уход хотспотов перерисовывают `<PanoViewer>`, вращение — нет                                                                                                                                               | компонент-слот вместо функции                                                                                | согласовано 2026-10-02 |
| D116 | `<Hotspot>` берёт просмотрщик из контекста `<PanoViewer>`, а вне его — из пропа `viewer`; у `usePanoViewer` контекста нет                                                                                                                                                                                                  | только внутри `<PanoViewer>`; провайдер контекста для хука                                                   | согласовано 2026-10-02 |
| D117 | `addHotspot` после `destroy()` возвращает объект, методы которого ничего не делают; аргументы всё равно проверяются                                                                                                                                                                                                        | бросать ошибку                                                                                               | согласовано 2026-10-02 |
| D118 | Песочница: точки на полу между сценами демо-тура, текстовый хотспот, пины через `addHotspot`, журнал событий и переключатель отмены перехода; React — `renderHotspot` и `<Hotspot>` с переключателем видимости                                                                                                             | только ванильная страница                                                                                    | согласовано 2026-10-02 |
| D119 | Документы: раздел хотспотов в `docs/tour.md`, раздел «Hotspots» и события в `docs/api.md`, `<Hotspot>` и `renderHotspot` в `docs/react.md`, строка в `README.md`; строки хотспотов и neometria в `parity.md`                                                                                                               | только `docs/api.md`                                                                                         | согласовано 2026-10-02 |
| D120 | `usePanoViewer` с `renderHotspot` возвращает порталы полем `hotspotPortals` (`ReactNode`, без `renderHotspot` — `null`); хост рендерит его в своей разметке                                                                                                                                                                | поле `hotspots`; `renderHotspot` только у `<PanoViewer>`                                                     | согласовано 2026-10-02 |

### Контракт публичного API (добавления)

```ts
export const EnumHotspotAnchor = {
  Center: 'center',
  Top: 'top',
  Bottom: 'bottom',
  Left: 'left',
  Right: 'right',
  TopLeft: 'top-left',
  TopRight: 'top-right',
  BottomLeft: 'bottom-left',
  BottomRight: 'bottom-right',
} as const;

export interface IHotspotPlane {
  width: number;
  facing?: ISpherePoint;
  spin?: number;
}

export interface IHotspotTarget extends IShowSceneOptions {
  scene: string;
}

export interface IHotspot {
  id: string;
  position: TViewTarget;
  title?: string;
  target?: IHotspotTarget;
  data?: unknown;
  anchor?: THotspotAnchor;
  plane?: IHotspotPlane;
}

export interface IScene {
  // …M1–M2
  hotspots?: IHotspot[];
}

export interface IHotspotRenderContext {
  sceneId: string;
  signal: AbortSignal;
}

export interface IPanoViewerOptions {
  // …M1–M2
  renderHotspot?: (hotspot: IHotspot, context: IHotspotRenderContext) => HTMLElement;
}

export interface IAddHotspotOptions {
  element: HTMLElement;
  position: TViewTarget;
  scene?: string;
  anchor?: THotspotAnchor;
  plane?: IHotspotPlane;
}

export interface IHotspotHandle {
  setPosition: (position: TViewTarget) => void;
  setScene: (scene: string | undefined) => void;
  setAnchor: (anchor: THotspotAnchor | undefined) => void;
  setPlane: (plane: IHotspotPlane | undefined) => void;
  remove: () => void;
}

interface IPanoViewerEventMap {
  // …M1–M2
  hotspotClick: { sceneId: string; hotspot: IHotspot; preventDefault: () => void };
  hotspotEnter: { sceneId: string; hotspot: IHotspot };
  hotspotLeave: { sceneId: string; hotspot: IHotspot };
}

interface IPanoViewer {
  // …M1–M3
  addHotspot: (options: IAddHotspotOptions) => IHotspotHandle;
}
```

React:

```tsx
interface IPanoViewerProps {
  // …M1–M2; renderHotspot ядра заменён:
  renderHotspot?: (hotspot: IHotspot, sceneId: string) => ReactNode;
  onHotspotClick?: (payload: IPanoViewerEventMap['hotspotClick']) => void;
  onHotspotEnter?: (payload: IPanoViewerEventMap['hotspotEnter']) => void;
  onHotspotLeave?: (payload: IPanoViewerEventMap['hotspotLeave']) => void;
}

export interface IHotspotProps extends Omit<IAddHotspotOptions, 'element'> {
  viewer?: IPanoViewer | null;
  className?: string;
  children?: ReactNode;
}

export const Hotspot: (props: IHotspotProps) => ReactElement | null;

interface IUsePanoViewerResult {
  // …M1–M2
  hotspotPortals: ReactNode;
}
```

### Слой хотспотов в DOM

```
overlay
├── layer (на всю площадь, pointer-events: none, первый ребёнок — под интерфейсом хоста)
│   └── anchor (absolute, transform-origin 0 0; translate3d или matrix3d; z-index по расстоянию;
│       │       data-pano-hotspot, data-pano-visible; opacity 0 и pointer-events none позади камеры)
│       └── aligner (absolute, pointer-events: auto; translate(-50%, -50%) и т. п. по якорю)
│           └── элемент хоста или <button> по умолчанию — не трогается
└── дети хоста (LoadingBar и т. п.)
```

- Якорь выравнивается процентами `translate` у `aligner`, без измерения элемента.
- Плоскость: `anchor` получает `matrix3d`, которая переводит пиксели элемента (уже сдвинутые якорем) в
  пиксели экрана с перспективой.
- Слушатели клика, наведения и фокуса висят на `aligner`: события поднимаются к нему от любого
  элемента хоста.

### Математика размещения

Чистый модуль `math/hotspot-placement.ts`, все стили собираются из его результатов.

- **Точка.** `screenFromDirection(position)` — та же функция, что у `project`; `null` — позади камеры.
- **Плоскость.** Пусть:
  - `P` — точка мира (у точки сферы — единичное направление);
  - `U` — верхняя ось плоскости: проекция мировой вертикали на плоскость, у горизонтальной — направление
    от центра панорамы к `P` (D114), затем поворот на `spin`; `R` — правая ось, `R = N × U`;
  - `s = width / cssWidth` — единиц мира на пиксель элемента.

  Пиксель элемента `(u, v)` лежит в точке `W = P + s·(u·R − v·U)`. В осях камеры `xc`, `yc`, `zc`
  линейны по `(u, v, 1)`, а экранные `X·zc = cx·zc + kx·xc` и `Y·zc = cy·zc − ky·yc` — тоже.
  Здесь `kx = (ширина / 2) / tan(половины горизонтального FOV)`, `ky` — то же по вертикали. Поэтому
  отображение «пиксель элемента → экран» — однородное. Оно записывается как `matrix3d` со столбцами
  для `u`, `v`, `z = 0` и `1` и строками `X·zc`, `Y·zc`, `0`, `zc`.

- **Позади камеры.** Если `zc ≤ ε` у любого угла элемента, хотспот скрыт (D108).
- **Контракт-тест.** Углы элемента, пропущенные через матрицу, совпадают с `screenFromDirection` углов
  в мире с точностью 0.5 CSS-пикселя.

Формул, живущих и в GLSL, и в TypeScript, изменение не добавляет: шейдеры не трогаются.

### Жизнь хотспотов

```
present({ scene, … }) ──► хотспоты прежней сцены: leave для наведённых, signal.abort(), убрать из DOM
                      ──► хотспоты scene: элемент (renderHotspot или кнопка), слушатели, в слой
refreshScene({ scene, limits }) (setTour с той же сценой) ──► если hotspots сцены изменились — так же
addHotspot ──► проверка аргументов ──► запись в слой с scene или без
кадр: если менялись вид, размер, набор хотспотов или размер элемента плоскости ──► layout()
click на aligner ──► hotspotClick ──► не отменён и есть target ──► showScene(target).catch(игнор)
pointerenter / focusin ──► вход (если первый) ──► hotspotEnter, preloadScene(target.scene)
pointerleave / focusout ──► уход (если не осталось ни наведения, ни фокуса) ──► hotspotLeave
focusin + :focus-visible + точка вне кадра ──► lookAt(position)
```

### Изменения навигатора

- `ISceneAppearance` получает `scene: IScene` — сцену того тура, в котором она принята к показу.
- `applyLimits(limits)` заменяется на `refreshScene({ scene, limits })`: при `setTour` с той же сценой
  на экране обновляются и ограничения, и хотспоты.

### Модули

| Модуль                                                                           | Ответственность                                                                                                   | Чистый?                                |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `hotspots/hotspot-dictionaries.ts`                                               | `EnumHotspotAnchor` и доли сдвига для каждого якоря                                                               | да                                     |
| `hotspots/hotspot-types.ts`                                                      | публичные типы хотспотов                                                                                          | да                                     |
| `tour/validate-hotspots.ts`                                                      | проверка `hotspots` сцены (D98), вызывается из `validateTour` со списком id сцен                                  | да                                     |
| `hotspots/add-hotspot-options.ts`                                                | проверка аргументов `addHotspot` и сеттеров                                                                       | да                                     |
| `math/hotspot-placement.ts`                                                      | экранная точка, базис плоскости, `matrix3d`, «позади камеры», расстояние для порядка наложения                    | да                                     |
| `hotspots/hotspot-presence.ts`                                                   | какие хотспоты видны при сцене на экране; состояние входа (наведение + фокус)                                     | да                                     |
| `hotspots/hotspot-layer.ts`                                                      | DOM слоя: `anchor`/`aligner`, стили из размещения, `ResizeObserver` для плоскостей, `layout()` по флагу изменений | нет                                    |
| `hotspots/tour-hotspots.ts`                                                      | элементы хотспотов сцены, кнопка по умолчанию, слушатели, события, навигация, предзагрузка, фокус → `lookAt`      | нет                                    |
| `viewer/viewer-navigation.ts`                                                    | связка навигатора с камерой, вводом, поворотом и хотспотами — вынос из `create-pano-viewer.ts` (лимит 300 строк)  | нет                                    |
| `viewer/create-pano-viewer.ts`                                                   | `addHotspot`, опция `renderHotspot`, шаг слоя в кадре                                                             | нет                                    |
| `navigation/*`                                                                   | `scene` в `ISceneAppearance`, `refreshScene` вместо `applyLimits`                                                 | нет (проверяется поддельными сессиями) |
| `react/hotspot.tsx`, `react/hotspot-context.ts`, `react/use-hotspot-portals.tsx` | `<Hotspot>`, контекст просмотрщика, порталы `renderHotspot`                                                       | нет                                    |

## Risks / Trade-offs

- [`matrix3d` в разных браузерах рисует текст в плоскости с разной чёткостью] → метки на полу у neometria
  — простые фигуры; в песочнице проверяются Chrome и Safari. WebGL-поверхности для сложных случаев — M5.
- [Хотспоты позади камеры остаются в DOM и в Tab] → это выбор владельца (D99); `opacity: 0` и
  `pointer-events: none` не дают нажать невидимое, а фокус разворачивает камеру.
- [Много хотспотов — много `style.transform` в кадре вращения] → запись только при изменениях, без
  чтения раскладки; neometria держит до десятков хотспотов на сцену.
- [Появление хотспотов перерисовывает `<PanoViewer>` с `renderHotspot`] → один рендер на смену сцены,
  вращение рендеров не вызывает (D115).
- [`overflow: clip` нет в старых браузерах] → поддерживается всеми браузерами с WebGL2, которые
  поддерживает библиотека (Chrome 90+, Safari 16+, Firefox 81+).

## Migration Plan

- Для ядра изменение обратно совместимо: новые поле сцены, метод, опция, события, словарь и типы. Код
  M1–M3 компилируется без правок. `overflow: clip` у корня не меняет раскладку.
- neometria убирает строковые хотспоты, глобальные колбэки и rAF-цикл пинов:
  - точки на полу — хотспоты тура с `plane` и `target`;
  - пины — `<Hotspot>`;
  - аналитика и маршрутизация — `onHotspotClick` и `onSceneChange`.

## Open Questions

Нет. Все решения D88–D120 согласованы с владельцем 2026-10-02 (D120 — при реализации).
