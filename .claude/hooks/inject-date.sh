#!/usr/bin/env bash
# SessionStart hook: prints today's date so Claude has it as ground truth in context.
# Output of this script is injected into the session's system context.
#
# Why: the harness already provides `currentDate`, but it can drift if a session
# is resumed days later or runs past midnight. This re-anchors Claude on each
# SessionStart event (startup, resume, compact, clear).

set -euo pipefail

LOCAL_DATE=$(date '+%Y-%m-%d')
LOCAL_TIME=$(date '+%H:%M:%S %Z')
WEEKDAY=$(date '+%A')
UTC_DATE=$(date -u '+%Y-%m-%d %H:%M:%S UTC')
ISO_WEEK=$(date '+%G-W%V')

cat <<EOF
[date-anchor]
Today is $WEEKDAY, $LOCAL_DATE.
Local time: $LOCAL_TIME.
UTC: $UTC_DATE.
ISO week: $ISO_WEEK.
Use this as the current date for any time-sensitive reasoning (changelogs, memory entries, deadlines, "today/yesterday/tomorrow" resolution).
EOF
