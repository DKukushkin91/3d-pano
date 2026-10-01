#!/usr/bin/env bash
# PostToolUse(Write|Edit) hook: форматирует и линтует файл, который только что тронул агент.
# Для src/**, scripts/**, examples/*/src/** запускает oxfmt и oxlint, затем сообщает
# оставшиеся ошибки линтера. Сгенерированные и вендорные пути пропускает.

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_response.filePath // .tool_input.file_path // empty')

[ -z "$FILE_PATH" ] && exit 0
[ ! -f "$FILE_PATH" ] && exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
REL_PATH="${FILE_PATH#$PROJECT_DIR/}"

case "$REL_PATH" in
  node_modules/*|*/node_modules/*|dist/*|*/dist/*) exit 0 ;;
  .agents/*|.cursor/*|.claude/commands/opsx/*|.claude/skills/openspec-*) exit 0 ;;
esac

case "$REL_PATH" in
  src/*.ts|src/*.tsx|src/**/*.ts|src/**/*.tsx) ;;
  scripts/*.mjs) ;;
  examples/*/src/*.ts|examples/*/src/*.tsx|examples/*/src/**/*.ts|examples/*/src/**/*.tsx) ;;
  *.md) (cd "$PROJECT_DIR" && pnpm exec oxfmt "$REL_PATH" >/dev/null 2>&1) || true; exit 0 ;;
  *) exit 0 ;;
esac

command -v pnpm >/dev/null 2>&1 || exit 0
[ -d "$PROJECT_DIR/node_modules" ] || exit 0

(cd "$PROJECT_DIR" && pnpm exec oxfmt "$REL_PATH" >/dev/null 2>&1) || true

ERRORS=$(cd "$PROJECT_DIR" && pnpm exec oxlint --type-aware "$REL_PATH" 2>&1) || true

if echo "$ERRORS" | grep -qE "Found [1-9][0-9]* (warning|error)"; then
  jq -n --arg errors "$ERRORS" --arg file "$REL_PATH" '{
    "hookSpecificOutput": {
      "hookEventName": "PostToolUse",
      "additionalContext": ("Lint errors in " + $file + ":\n" + $errors + "\nFix these errors before continuing.")
    }
  }'
fi

exit 0
