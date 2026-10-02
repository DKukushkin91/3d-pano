# Spec Delta

## MODIFIED Requirements

### Requirement: Обработчики событий как пропсы

Пропсы `onSceneLoadStart`, `onSceneReady`, `onSceneChange`, `onViewChange`, `onError`,
`onHotspotClick`, `onHotspotEnter`, `onHotspotLeave` SHALL вызываться при соответствующих событиях;
смена функции-обработчика MUST NOT пересоздавать просмотрщик. Проверка: сценарий песочницы.

#### Scenario: Новый обработчик на каждый рендер

- **WHEN** родитель передаёт новую функцию `onViewChange` при каждом рендере
- **THEN** просмотрщик не пересоздаётся, вызывается последняя переданная функция

#### Scenario: Отмена перехода из React

- **WHEN** `onHotspotClick` вызывает `preventDefault()` и меняет состояние приложения
- **THEN** просмотрщик сам сцену не меняет, а обработчик получает объект хотспота из тура

## ADDED Requirements

### Requirement: Своя отрисовка хотспотов в React

Проп `renderHotspot(hotspot, sceneId)` `<PanoViewer>` и `usePanoViewer` SHALL возвращать `ReactNode`,
который рендерится порталом в элемент хотспота из тура; `usePanoViewer` отдаёт порталы полем
`hotspotPortals` для разметки хоста. Новая функция в каждом рендере MUST NOT
пересоздавать элементы хотспотов; результат перерисовывается с последней функцией. Проверка: сценарий
песочницы.

#### Scenario: Хук со своей разметкой

- **WHEN** хост передаёт `renderHotspot` в `usePanoViewer` и рендерит `{hotspotPortals}` в своей разметке
- **THEN** точки сцены рисуются его компонентом так же, как у `<PanoViewer>`

#### Scenario: Компонент точки на полу

- **WHEN** хост передаёт `renderHotspot={(hotspot) => <FloorSpot title={hotspot.title} />}`
- **THEN** точки сцены рисуются компонентом хоста, а клик по ним переходит в сцену `target`

### Requirement: Компонент Hotspot

`<Hotspot position scene? anchor? plane?>` SHALL показывать детей в хотспоте хоста через `addHotspot`:
внутри `<PanoViewer>` он берёт просмотрщик из контекста, вне его — из пропа `viewer`. Смена пропса MUST
вызывать его сеттер, размонтирование — `remove`; позицию при вращении ставит библиотека без перерисовок
React. Проверка: сценарий песочницы.

#### Scenario: Пины товаров

- **WHEN** хост рендерит `<Hotspot>` для каждого товара комнаты внутри `<PanoViewer>`
- **THEN** карточки стоят в своих точках, переключатель видимости убирает их размонтированием, а вращение не вызывает рендеров
