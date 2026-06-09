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
if [ -z "$version" ]; then
	echo "ERROR: could not read version from packages/cli/package.json" >&2
	exit 1
fi

sed 's/"workspace:\*"/"'"$version"'"/g' package.json > package.json.tmp
if grep -q 'workspace:\*' package.json.tmp; then
	echo "ERROR: sed did not replace all workspace:* deps in package.json" >&2
	rm -f package.json.tmp
	exit 1
fi
if ! grep -q "\"$version\"" package.json.tmp; then
	echo "ERROR: packed package.json missing expected version $version" >&2
	rm -f package.json.tmp
	exit 1
fi
mv package.json package.json.bak
mv package.json.tmp package.json

npm pack --pack-destination "$TARBALL_DIR" >/dev/null

mv package.json.bak package.json

tarball_path=$(ls -1 "$TARBALL_DIR"/agentuity-cli-*.tgz 2>/dev/null | head -1 || true)
if [ -z "$tarball_path" ] || [ ! -f "$tarball_path" ]; then
	echo "ERROR: npm pack did not produce agentuity-cli-*.tgz in $TARBALL_DIR" >&2
	ls -la "$TARBALL_DIR" >&2 || true
	exit 1
fi
tarball_name=$(basename "$tarball_path")
tarball_rel="dist/packages/$tarball_name"
printf '%s\n' "$tarball_rel" >"$MARKER"
echo "Packed CLI for install tests: $SDK_ROOT/$tarball_rel"
