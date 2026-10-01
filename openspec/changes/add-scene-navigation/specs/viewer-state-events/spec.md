# Spec Delta

## MODIFIED Requirements

### Requirement: Снимок состояния

`getSnapshot()` SHALL возвращать неизменяемый объект `{ sceneId, status, loadProgress, isInteracting,
isTransitioning, error }`. `sceneId` — сцена последней принятой смены, даже если на экране ещё
предыдущая. `status` и `loadProgress` описывают эту сцену: `loading` (она ещё не видна), `preview`
(видно её превью, основное изображение грузится), `ready` или `error`. Пока состояние не изменилось,
MUST возвращаться тот же объект. Вид камеры в снимок не входит. Проверка: контракт-тест.

#### Scenario: Повторное чтение

- **WHEN** хост дважды вызывает `getSnapshot()` без изменений между вызовами
- **THEN** оба вызова возвращают один и тот же объект

#### Scenario: Вращение не меняет снимок

- **WHEN** пользователь вращает загруженную сцену после отпускания указателя (инерция)
- **THEN** объект снимка не меняется

#### Scenario: Сначала превью

- **WHEN** превью сцены загрузилось раньше основного изображения
- **THEN** `status` становится `preview`, а после загрузки основного изображения — `ready`

#### Scenario: Полоса загрузки при смене комнаты

- **WHEN** хост вызывает `showScene('bedroom')`, пока на экране `kitchen`
- **THEN** снимок сразу содержит `sceneId: 'bedroom'`, `status: 'loading'` и растущий `loadProgress`, а на экране до готовности остаётся `kitchen`

### Requirement: Типизированные события

`on(name, handler)` SHALL подписывать обработчик на событие и возвращать функцию отписки. События:
`sceneLoadStart` и `sceneReady` с `{ sceneId }`, `sceneChange` с `{ sceneId, previousSceneId }`,
`viewChange` с `{ view }`, `error` с `{ error }`. `sceneLoadStart` и `sceneReady` MUST приходить на
каждую принятую смену сцены, в том числе из кэша. Проверка: контракт-тест эмиттера и навигатора,
проверка типов.

#### Scenario: Подписка и отписка

- **WHEN** хост подписался на `sceneReady`, а затем вызвал функцию отписки
- **THEN** обработчик больше не вызывается

#### Scenario: Сцена из кэша

- **WHEN** хост показывает предзагруженную сцену
- **THEN** `sceneLoadStart` и сразу за ним `sceneReady` всё равно приходят

### Requirement: Описание ошибок

Ошибка SHALL быть объектом `{ category, code, message, url?, httpStatus?, issues?, cause? }`. Категория
задаёт действие хоста: `webgl` — заглушка, `tour` — ошибка данных, `resource` — можно повторить,
`image` — ошибка ассетов. Коды: `webgl-unavailable` (webgl), `invalid-tour` и `unknown-scene` (tour),
`network-failed`, `http-status`, `decode-failed`, `loader-failed` (resource), `invalid-image` (image).
Проверка: контракт-тест классификации и проверка типов.

#### Scenario: Ответ 404

- **WHEN** сервер отвечает 404 на запрос грани
- **THEN** ошибка содержит категорию `resource`, код `http-status`, `httpStatus` 404 и URL грани

#### Scenario: Сбой загрузчика хоста

- **WHEN** функция `loader` хоста отклоняет промис
- **THEN** ошибка содержит категорию `resource`, код `loader-failed` и исходную ошибку в `cause`

#### Scenario: Неизвестная сцена

- **WHEN** хост вызывает `showScene` с `id`, которого нет в туре
- **THEN** ошибка в поле `details` исключения содержит категорию `tour` и код `unknown-scene`

## ADDED Requirements

### Requirement: Событие смены сцены

Событие `sceneChange` с `{ sceneId, previousSceneId }` SHALL приходить каждый раз, когда меняется
`snapshot.sceneId`: при принятой смене (до загрузки новой сцены) и для стартовой сцены с
`previousSceneId: null`. Замена тура с той же `id` сцены MUST NOT слать это событие. Проверка:
контракт-тест навигатора.

#### Scenario: Подсветка комнаты в списке хоста

- **WHEN** сцена сменилась вызовом `showScene` через `ref`, а не через состояние хоста
- **THEN** хост получает `sceneChange` и подсвечивает новую комнату в своём списке
