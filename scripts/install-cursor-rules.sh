#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 /absolute/path/to/target-project"
  exit 1
fi

TARGET="$1"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -d "$TARGET" ]; then
  echo "Target project does not exist: $TARGET"
  exit 1
fi

mkdir -p "$TARGET/.cursor" "$TARGET/docs" "$TARGET/templates"
rsync -a --delete "$ROOT_DIR/.cursor/" "$TARGET/.cursor/"
rsync -a "$ROOT_DIR/docs/agent-playbook.md" "$TARGET/docs/agent-playbook.md"
rsync -a "$ROOT_DIR/templates/" "$TARGET/templates/"

echo "Installed Orbit agent assets into: $TARGET"
