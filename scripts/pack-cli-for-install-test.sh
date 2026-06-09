#!/bin/bash
# Build (if needed) and pack @agentuity/cli for install.sh CI/local tests.
# Writes the absolute tarball path to dist/packages/.cli-install-tarball.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARBALL_DIR="$SDK_ROOT/dist/packages"
MARKER="$TARBALL_DIR/.cli-install-tarball"

source "$SDK_ROOT/scripts/lib/ensure-cli-built.sh"

mkdir -p "$TARBALL_DIR"
rm -f "$TARBALL_DIR"/agentuity-cli-*.tgz

cd "$SDK_ROOT/packages/cli"
version=$(grep '"version"' package.json | head -1 | awk -F'"' '{print $4}')

sed 's/"workspace:\*"/"'"$version"'"/g' package.json > package.json.tmp
mv package.json package.json.bak
mv package.json.tmp package.json

npm pack --pack-destination "$TARBALL_DIR" >/dev/null

mv package.json.bak package.json

tarball_name=$(basename "$(ls -1 "$TARBALL_DIR"/agentuity-cli-*.tgz | head -1)")
tarball_rel="dist/packages/$tarball_name"
printf '%s\n' "$tarball_rel" >"$MARKER"
echo "Packed CLI for install tests: $SDK_ROOT/$tarball_rel"
