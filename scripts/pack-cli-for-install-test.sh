#!/bin/bash
# Build (if needed) and pack @agentuity/cli for install.sh CI/local tests.
# Packs the CLI dependency closure with semver-resolved package.json files and
# writes dist/packages/.cli-install-manifest for flat local installation.
# Writes the relative CLI tarball path to dist/packages/.cli-install-tarball.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARBALL_DIR="$SDK_ROOT/dist/packages"
MARKER="$TARBALL_DIR/.cli-install-tarball"
MANIFEST="$TARBALL_DIR/.cli-install-manifest"

source "$SDK_ROOT/scripts/lib/ensure-cli-built.sh"
source "$SDK_ROOT/scripts/lib/pack-file-deps.sh"

mkdir -p "$TARBALL_DIR"
rm -f "$TARBALL_DIR"/agentuity-*.tgz "$MANIFEST"

PACK_ORDER=()
while IFS= read -r pkg; do
	[ -n "$pkg" ] && PACK_ORDER+=("$pkg")
done < <(pack_file_deps_order cli)
if [ ${#PACK_ORDER[@]} -eq 0 ]; then
	echo "ERROR: no workspace packages found for CLI install pack" >&2
	exit 1
fi

for pkg in "${PACK_ORDER[@]}"; do
	if [ ! -d "$SDK_ROOT/packages/$pkg/dist" ]; then
		echo "ERROR: packages/$pkg/dist missing; run bun run build first" >&2
		exit 1
	fi
done

for pkg in "${PACK_ORDER[@]}"; do
	pack_workspace_package_with_resolved_versions "$pkg" "$TARBALL_DIR"
	tarball_name=$(ls -1 "$TARBALL_DIR"/agentuity-"${pkg}"-*.tgz | head -1)
	if [ "$pkg" = "cli" ]; then
		printf 'cli:%s\n' "$(basename "$tarball_name")" >>"$MANIFEST"
	else
		printf '%s\n' "$(basename "$tarball_name")" >>"$MANIFEST"
	fi
done

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
