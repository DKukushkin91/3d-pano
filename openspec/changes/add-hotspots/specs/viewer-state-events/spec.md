# Spec Delta

## MODIFIED Requirements

### Requirement: Типизированные события

`on(name, handler)` SHALL подписывать обработчик на событие и возвращать функцию отписки. События:
`sceneLoadStart` и `sceneReady` с `{ sceneId }`, `sceneChange` с `{ sceneId, previousSceneId }`,
`viewChange` с `{ view }`, `error` с `{ error }`, `hotspotEnter` и `hotspotLeave` с
`{ sceneId, hotspot }`, `hotspotClick` — с ними же и `preventDefault`. `sceneLoadStart` и `sceneReady`
MUST приходить на каждую принятую смену сцены, в том числе из кэша. Проверка: контракт-тесты и проверка типов.

#### Scenario: Подписка и отписка

- **WHEN** хост подписался на `sceneReady`, а затем вызвал функцию отписки
- **THEN** обработчик больше не вызывается

#### Scenario: Сцена из кэша

- **WHEN** хост показывает предзагруженную сцену
- **THEN** `sceneLoadStart` и сразу за ним `sceneReady` всё равно приходят

#### Scenario: Клик по хотспоту

- **WHEN** хост подписан на `hotspotClick`, и пользователь нажимает хотспот из тура
- **THEN** обработчик получает `sceneId`, объект хотспота из тура и функцию `preventDefault`
