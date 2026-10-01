#!/usr/bin/env bash
# Stop hook: перед завершением ответа проверяет типы и политику комментариев, если в этой
# сессии менялись исходники библиотеки или песочницы. Падение блокирует Stop и показывает вывод.

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

CHANGED=$(git diff --name-only HEAD 2>/dev/null; git ls-files --others --exclude-standard 2>/dev/null) || CHANGED=""
[ -z "$CHANGED" ] && exit 0

command -v pnpm >/dev/null 2>&1 || exit 0
[ -d "$PROJECT_DIR/node_modules" ] || exit 0

if ! echo "$CHANGED" | grep -qE '^(src/|examples/[^/]+/src/|scripts/)'; then
  exit 0
fi

REPORT=""
FAILED=0

for step in typecheck check:comments check:clean-room; do
  if ! out=$(pnpm run --silent "$step" 2>&1); then
    REPORT="${REPORT}--- ${step} ---\n$out\n"
    FAILED=1
  fi
done

if [ "$FAILED" = 1 ]; then
  jq -n --arg report "$REPORT" '{
    "decision": "block",
    "reason": ("Pre-stop checks failed. Fix these before finishing:\n\n" + $report)
  }'
fi

exit 0
