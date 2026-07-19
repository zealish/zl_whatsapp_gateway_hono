#!/bin/bash

# Build Tailwind CSS for documentation
# Usage: ./scripts/build-docs-css.sh [--watch]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

INPUT_FILE="$PROJECT_DIR/docs/css/input.css"
OUTPUT_FILE="$PROJECT_DIR/docs/css/output.css"

if [ "$1" = "--watch" ]; then
  echo "Watching for CSS changes..."
  npx tailwindcss -i "$INPUT_FILE" -o "$OUTPUT_FILE" --watch
else
  echo "Building CSS..."
  npx tailwindcss -i "$INPUT_FILE" -o "$OUTPUT_FILE" --minify
  echo "CSS built successfully: $OUTPUT_FILE"
fi
