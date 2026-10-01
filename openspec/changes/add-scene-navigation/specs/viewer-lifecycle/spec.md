# Spec Delta

## MODIFIED Requirements

### Requirement: Обновление опций

`update(partialOptions)` SHALL применять `label`, `loader`, `retry`, `controls`, `maxPixelRatio`,
`renderScale` и `sceneCacheMegabytes` к работающему просмотрщику без пересоздания. Ключ, явно
переданный со значением `undefined`, MUST возвращать опцию к значению по умолчанию. Уменьшение
`sceneCacheMegabytes` MUST сразу вытеснять лишние сцены. Проверка: контракт-тест разрешения опций и
сценарий песочницы.

#### Scenario: Отключение колеса на лету

- **WHEN** хост вызывает `update({ controls: { wheel: false } })`
- **THEN** колесо перестаёт менять FOV, остальные виды управления продолжают работать, сцена не перезагружается

#### Scenario: Сброс опции к умолчанию

- **WHEN** хост вызывает `update({ maxPixelRatio: undefined })`
- **THEN** используется значение по умолчанию 2

#### Scenario: Освободить видеопамять

- **WHEN** хост вызывает `update({ sceneCacheMegabytes: 0 })`
- **THEN** из кэша вытесняются все сцены, кроме сцены на экране и переходной

### Requirement: Проверка опций

Неверные опции — ошибки программиста — SHALL отклоняться синхронно: не-элемент вместо контейнера и
пустой `label` — `TypeError`; нечисловые, бесконечные или неположительные `maxPixelRatio`,
`renderScale`, `controls.wheelSpeed`, `controls.keyboardSpeed`, `controls.inertiaFriction`, а также
отрицательные или дробные `retry.attempts`, отрицательный `retry.delayMs` и нечисловой, бесконечный
или отрицательный `sceneCacheMegabytes` — `RangeError`. Текст ошибки MUST начинаться с `3d-pano:` и
называть опцию. Проверка: контракт-тест.

#### Scenario: Отрицательная плотность пикселей

- **WHEN** хост передаёт `maxPixelRatio: -1`
- **THEN** вызов бросает `RangeError` с текстом, содержащим `3d-pano:` и `maxPixelRatio`

#### Scenario: Отрицательный бюджет кэша

- **WHEN** хост передаёт `sceneCacheMegabytes: -1`
- **THEN** вызов бросает `RangeError` с текстом, содержащим `3d-pano:` и `sceneCacheMegabytes`
