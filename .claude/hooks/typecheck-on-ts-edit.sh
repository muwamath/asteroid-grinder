#!/usr/bin/env bash
# PostToolUse hook: run `npm run typecheck` whenever an Edit/Write/MultiEdit
# touches a TS file under src/. Fast (tsc --noEmit), no side effects.
# If typecheck fails, print the tail and exit 2 so Claude sees the error.
set -euo pipefail

payload=$(cat)
file_path=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // .tool_input.filePath // empty')

project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
case "$file_path" in
  "$project_dir"/src/*.ts|"$project_dir"/src/*.tsx) ;;
  *) exit 0 ;;
esac

cd "$project_dir"

if ! out=$(npm --silent run typecheck 2>&1); then
  printf 'typecheck failed after edit to %s\n\n%s\n' "$file_path" "$(printf '%s' "$out" | tail -40)" >&2
  exit 2
fi
exit 0
