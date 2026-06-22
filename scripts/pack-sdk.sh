#!/bin/bash
# Pack SDK packages as tarballs for production-like testing
# Dynamically discovers all packages in packages/ directory
# Validates that packages are built first
# Safe to run locally or in CI - idempotent

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARBALL_DIR="$SDK_ROOT/dist/packages"

package_json_flag() {
	bun -e "const pkg = await Bun.file(process.argv[1]).json(); const path = process.argv[2].split('.'); let value = pkg; for (const key of path) value = value?.[key]; process.stdout.write(value === true ? 'yes' : 'no');" "$1" "$2"
}

package_has_build() {
	bun -e "const pkg = await Bun.file(process.argv[1]).json(); process.stdout.write(pkg.scripts?.build ? 'yes' : 'no');" "$1"
}

is_source_only_package() {
	local candidate="$1"
	for source_pkg in "${SOURCE_ONLY_PACKAGES[@]}"; do
		if [ "$source_pkg" = "$candidate" ]; then
			return 0
		fi
	done
	return 1
}

echo "📦 Packing SDK Packages"
echo "======================"
echo ""

# Auto-discover all packages that should be packed.
echo "Discovering packages..."
PACKAGES=()
SOURCE_ONLY_PACKAGES=()
SKIPPED=()
for pkg_dir in "$SDK_ROOT"/packages/*; do
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
		
		if [ "$is_private" = "yes" ] && [ "$has_build" = "no" ]; then
			reason="private/no-build"
			if [ "$is_source_only" = "yes" ]; then
				reason="source-only"
			fi
			SKIPPED+=("$pkg_name ($reason)")
			continue
		fi
		
		PACKAGES+=("$pkg_name")
		if [ "$is_source_only" = "yes" ]; then
			SOURCE_ONLY_PACKAGES+=("$pkg_name")
		fi
	fi
done

echo "Found ${#PACKAGES[@]} packages to pack:"
for pkg in "${PACKAGES[@]}"; do
	echo "  • $pkg"
done

if [ ${#SKIPPED[@]} -gt 0 ]; then
	echo ""
	echo "Skipped ${#SKIPPED[@]} packages:"
	for pkg in "${SKIPPED[@]}"; do
		echo "  • $pkg"
	done
fi
echo ""

# Verify packages are built
echo "Verifying packages are built..."
FAILED=0
for pkg in "${PACKAGES[@]}"; do
	if is_source_only_package "$pkg"; then
		echo "  ⊘ @agentuity/$pkg (source-only)"
		continue
	fi

	if [ ! -d "$SDK_ROOT/packages/$pkg/dist" ]; then
		echo "  ✗ @agentuity/$pkg (not built)"
		FAILED=1
	else
		echo "  ✓ @agentuity/$pkg"
	fi
done

if [ $FAILED -eq 1 ]; then
	echo ""
	echo "❌ ERROR: Some packages are not built"
	echo "Run: bash scripts/build-sdk.sh"
	exit 1
fi
echo ""

# Create tarball directory
mkdir -p "$TARBALL_DIR"
rm -f "$TARBALL_DIR"/*.tgz

# Pack each package (replace workspace:* with versions first)
echo "Packing packages..."
for pkg in "${PACKAGES[@]}"; do
	cd "$SDK_ROOT/packages/$pkg"
	
	# Get package version
	version=$(grep '"version"' package.json | head -1 | awk -F'"' '{print $4}')
	
	# Replace workspace:* with actual version for packing
	sed 's/"workspace:\*"/"'$version'"/g' package.json > package.json.tmp
	mv package.json package.json.bak
	mv package.json.tmp package.json
	
	# Pack with replaced versions
	TARBALL=$(npm pack --pack-destination "$TARBALL_DIR" 2>&1 | tail -1)
	
	# Restore original package.json
	mv package.json.bak package.json
	
	echo "  ✓ @agentuity/$pkg → $TARBALL"
	
	cd "$SDK_ROOT"
done

echo ""
echo "✅ Packed ${#PACKAGES[@]} packages to dist/packages/"
echo ""
ls -lh "$TARBALL_DIR"
