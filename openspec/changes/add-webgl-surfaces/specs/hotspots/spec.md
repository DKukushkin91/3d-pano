# Spec Delta

## MODIFIED Requirements

### Requirement: Хотспоты хоста

`addHotspot({ element, position, scene?, anchor?, plane?, surface? })` SHALL показывать элемент хоста в
оверлее и возвращать `{ setPosition, setScene, setAnchor, setPlane, setSurface, remove }`; сеттер с
`undefined` возвращает поле к умолчанию, `remove` убирает элемент. Хотспот со `scene` MUST показываться
только в этой сцене, без `scene` — в любой. После `remove` или `destroy()` методы MUST ничего не делать.
Проверка: сценарий песочницы.

#### Scenario: Карточка товара

- **WHEN** хост вызывает `addHotspot({ element: card, position: { x: 1.5, y: -0.4, z: 2 } })`
- **THEN** карточка стоит в проекции точки и следует за ней при вращении камеры

#### Scenario: Пин другой сцены

- **WHEN** хост добавил хотспот со `scene: 'kitchen-v2'`, а на экране `kitchen-v1`
- **THEN** элемент не показан, пока на экран не выйдет `kitchen-v2`

#### Scenario: Пин переехал

- **WHEN** хост вызывает `setPosition` с новой точкой
- **THEN** элемент в следующем кадре стоит в проекции новой точки, а DOM-узел тот же

#### Scenario: Видео на стене

- **WHEN** хост вызывает `addHotspot` с `plane` и `surface: { video: videoElement }`
- **THEN** кадры его видео рисуются в плоскости хотспота, а элемент остаётся зоной нажатия
