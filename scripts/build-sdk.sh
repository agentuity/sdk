#!/bin/bash
# Build all SDK packages once
# Dynamically discovers all packages in packages/ directory
# Safe to run locally or in CI - idempotent

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PACKAGES_ONLY=false
for arg in "$@"; do
	if [ "$arg" = "--packages-only" ]; then
		PACKAGES_ONLY=true
	fi
done

echo "🔨 Building SDK Packages"
echo "======================="
echo ""

cd "$SDK_ROOT"

package_json_flag() {
	bun -e "const pkg = await Bun.file(process.argv[1]).json(); const path = process.argv[2].split('.'); let value = pkg; for (const key of path) value = value?.[key]; process.stdout.write(value === true ? 'yes' : 'no');" "$1" "$2"
}

package_has_build() {
	bun -e "const pkg = await Bun.file(process.argv[1]).json(); process.stdout.write(pkg.scripts?.build ? 'yes' : 'no');" "$1"
}

# Auto-discover all packages that have a build script
echo "Discovering packages..."
PACKAGES=()
SKIPPED=()
for pkg_dir in packages/*; do
	if [ -d "$pkg_dir" ] && [ -f "$pkg_dir/package.json" ]; then
		pkg_name=$(basename "$pkg_dir")
		
		# Skip vscode package (separate extension, not part of SDK distribution)
		if [ "$pkg_name" = "vscode" ]; then
			SKIPPED+=("$pkg_name (vscode extension)")
			continue
		fi
		
		# Publishable packages that intentionally ship source assets instead of dist/
		# declare this marker in package.json: { "agentuity": { "sourceOnly": true } }.
		has_build=$(package_has_build "$pkg_dir/package.json")
		is_private=$(package_json_flag "$pkg_dir/package.json" "private")
		is_source_only=$(package_json_flag "$pkg_dir/package.json" "agentuity.sourceOnly")
		
		if [ "$is_source_only" = "yes" ] || { [ "$is_private" = "yes" ] && [ "$has_build" = "no" ]; }; then
			SKIPPED+=("$pkg_name (source-only)")
			continue
		fi
		
		PACKAGES+=("$pkg_name")
	fi
done

echo "Found ${#PACKAGES[@]} packages with build scripts:"
for pkg in "${PACKAGES[@]}"; do
	echo "  • $pkg"
done

if [ ${#SKIPPED[@]} -gt 0 ]; then
	echo ""
	echo "Skipped ${#SKIPPED[@]} source-only packages:"
	for pkg in "${SKIPPED[@]}"; do
		echo "  • $pkg"
	done
fi
echo ""

# Build all packages
echo "Building packages..."
if [ "$PACKAGES_ONLY" = "true" ]; then
	echo "(packages only - skipping test app builds)"
	bun run build:packages
else
	bun run build
fi

echo ""
echo "✅ SDK build complete"
echo ""

# Verify all packages have dist/ folders
echo "Verifying build artifacts..."
FAILED=0
for pkg in "${PACKAGES[@]}"; do
	if [ ! -d "packages/$pkg/dist" ]; then
		echo "  ✗ @agentuity/$pkg (missing dist/)"
		FAILED=1
	else
		echo "  ✓ @agentuity/$pkg"
	fi
done

if [ $FAILED -eq 1 ]; then
	echo ""
	echo "❌ ERROR: Some packages failed to build"
	exit 1
fi

echo ""
echo "✅ All ${#PACKAGES[@]} packages built successfully"
