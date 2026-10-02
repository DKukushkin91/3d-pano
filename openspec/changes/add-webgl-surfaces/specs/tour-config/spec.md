# Spec Delta

## MODIFIED Requirements

### Requirement: Структура тура

Тур SHALL быть объектом `{ startScene?, defaults?, scenes }`, где `scenes` — непустой массив сцен
`{ id, title?, source, preview?, view?, limits?, hotspots?, position?, heading?, cameraHeight? }`, а
`defaults` может содержать `view`, `limits` и `cameraHeight`. Хотспот сцены — `{ id, position, title?,
target?, data?, anchor?, plane?, surface? }`. Тур MUST быть сериализуемым в JSON: функций, элементов DOM и
кода в нём нет. Проверка: контракт-тест `validateTour`.

#### Scenario: Минимальный тур

- **WHEN** тур содержит одну сцену с `id` и `source`
- **THEN** `validateTour` не находит проблем, а просмотрщик показывает эту сцену

#### Scenario: Тур из ответа сервера

- **WHEN** тур получен как результат `JSON.parse` ответа сервера
- **THEN** он принимается без преобразований

#### Scenario: Хотспоты в JSON

- **WHEN** сцена из ответа сервера содержит `hotspots` с `target` и произвольным `data`
- **THEN** тур принимается без преобразований, а `data` доходит до `renderHotspot` и событий как есть

#### Scenario: Квартира в мире

- **WHEN** сцены из ответа сервера содержат `position`, `heading`, а `defaults` — `cameraHeight`
- **THEN** тур принимается без преобразований, и переходы «шаг» идут по этим данным

#### Scenario: Метки с картинкой и видео

- **WHEN** хотспоты сцены из ответа сервера содержат `plane` и `surface` с URL картинки или видео
- **THEN** тур принимается без преобразований, и поверхности рисуются по этим данным
