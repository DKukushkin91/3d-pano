# Spec Delta

## MODIFIED Requirements

### Requirement: Структура тура

Тур SHALL быть объектом `{ startScene?, defaults?, scenes }`, где `scenes` — непустой массив сцен
`{ id, title?, source, preview?, view?, limits?, hotspots? }`, а `defaults` может содержать `view` и
`limits`. Хотспот сцены — `{ id, position, title?, target?, data?, anchor?, plane? }`. Тур MUST быть
сериализуемым в JSON: функций, элементов DOM и кода в нём нет. Проверка: контракт-тест `validateTour`.

#### Scenario: Минимальный тур

- **WHEN** тур содержит одну сцену с `id` и `source`
- **THEN** `validateTour` не находит проблем, а просмотрщик показывает эту сцену

#### Scenario: Тур из ответа сервера

- **WHEN** тур получен как результат `JSON.parse` ответа сервера
- **THEN** он принимается без преобразований

#### Scenario: Хотспоты в JSON

- **WHEN** сцена из ответа сервера содержит `hotspots` с `target` и произвольным `data`
- **THEN** тур принимается без преобразований, а `data` доходит до `renderHotspot` и событий как есть

## ADDED Requirements

### Requirement: Валидация хотспотов

`validateTour` SHALL проверять хотспоты сцен строго, как остальной тур: `hotspots` — массив; `id`
непуст и уникален в сцене; `position` — конечные `yaw` и `pitch` или ненулевые конечные `x`, `y`, `z`;
`title` — строка; `target.scene` есть в туре, а опции перехода верны, как у `showScene`; `anchor` из
словаря; `plane.width` больше 0, углы `facing` и `spin` конечны. Любая проблема делает тур
невалидным. Проверка: контракт-тест.

#### Scenario: Переход в несуществующую сцену

- **WHEN** у хотспота третьей сцены `target.scene` — `attic`, а такой сцены нет
- **THEN** `validateTour` возвращает проблему с путём `scenes[2].hotspots[0].target.scene`

#### Scenario: Повторяющийся id хотспота

- **WHEN** в одной сцене два хотспота с `id` `door`
- **THEN** `validateTour` возвращает проблему с путём `scenes[0].hotspots[1].id`, а одинаковые `id` в разных сценах допустимы
