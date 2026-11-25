#!/usr/bin/env bash
# PreToolUse hook for Edit, Write and NotebookEdit: new work starts on a local
# branch, never on `main` (CLAUDE.md, "Working rules"). Blocks a file edit
# while the file's repository is on `main`, unless git ignores the file —
# `private/` and other ignored files never reach a commit, so they stay
# editable. Files outside a git repository are not this hook's business.
#
# Exit 2 blocks the tool call and hands stderr to Claude.
set -u

file=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')
[ -n "$file" ] || exit 0

# The file may not exist yet: ask git from the nearest existing directory.
dir=$(dirname "$file")
while [ ! -d "$dir" ] && [ "$dir" != "/" ]; do dir=$(dirname "$dir"); done

repo=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || exit 0
branch=$(git -C "$repo" branch --show-current 2>/dev/null)
[ "$branch" = "main" ] || exit 0

git -C "$repo" check-ignore -q -- "$file" && exit 0

echo "Blocked: $repo is on main. New work starts on a local branch: run \`git switch -c <name-of-the-work>\`, say so, then edit. (Gitignored files such as private/ stay editable on main.)" >&2
exit 2
