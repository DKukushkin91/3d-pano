# CLAUDE.md

Руководство для Claude Code. Общие правила для всех агентов — в `AGENTS.md`, он подключён целиком:

@AGENTS.md

## Автоматические хуки (не обходить)

- **PostToolUse (`Write|Edit`)** → `.claude/hooks/lint-format.sh` — `oxfmt` и `oxlint --type-aware` на
  тронутых `src/**`, `scripts/*.mjs`, `examples/*/src/**`; Markdown только форматируется.
  Сгенерированные файлы OpenSpec пропускаются.
- **Stop** → `.claude/hooks/typecheck-on-stop.sh` — если менялись `src/`, `scripts/` или песочница,
  гоняет `typecheck`, `check:comments`, `check:clean-room`. Падение блокирует завершение ответа.
- **SessionStart** → `.claude/hooks/inject-date.sh` — актуальная дата в контексте.

## Скиллы

- `/add-feature` — новая возможность через диалог и OpenSpec (вопросы → подходы → propose → apply).
- `/opsx:explore`, `/opsx:propose`, `/opsx:apply`, `/opsx:archive`, `/opsx:sync`, `/opsx:update` —
  жизненный цикл изменений OpenSpec (сгенерированы `openspec init`).
- `/learn` — изучить область библиотеки перед кодом.
- `/clarify` — объяснить фактическое поведение до правок.
- `/check` — `pnpm check` и починка без отключения правил.
- `/commit` — Conventional Commits на русском, без трейлеров.

## Режим работы

Работаем в одиночку: задачу ведёт один агент от начала до конца. Параллельные субагенты — только для
независимых исследований (поиск, сводка), а не для написания кода в одни и те же модули: единый стиль
важнее скорости. Если задача явно выиграет от параллельной разработки — предложи это пользователю
одним абзацем и спроси.
