#!/bin/bash
# Pack SDK packages as tarballs for production-like testing
# Dynamically discovers all packages in packages/ directory
# Validates that packages are built first
# Safe to run locally or in CI - idempotent

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARBALL_DIR="$SDK_ROOT/dist/packages"

echo "📦 Packing SDK Packages"
echo "======================"
echo ""

# Auto-discover all packages that should be packed (non-private with build output)
echo "Discovering packages..."
PACKAGES=()
SKIPPED=()
for pkg_dir in "$SDK_ROOT"/packages/*; do
	if [ -d "$pkg_dir" ] && [ -f "$pkg_dir/package.json" ]; then
		pkg_name=$(basename "$pkg_dir")
		
		# Skip vscode package (separate extension, not part of SDK distribution)
		if [ "$pkg_name" = "vscode" ]; then
			SKIPPED+=("$pkg_name (vscode extension)")
			continue
		fi
		
		# Check if package is private or has no build script (source-only)
		has_build=$(grep -q '"build"' "$pkg_dir/package.json" && echo "yes" || echo "no")
		is_private=$(grep -q '"private".*true' "$pkg_dir/package.json" && echo "yes" || echo "no")
		
		# Skip packages that are private and have no build script (source-only packages)
		if [ "$is_private" = "yes" ] && [ "$has_build" = "no" ]; then
			SKIPPED+=("$pkg_name (source-only)")
			continue
		fi
		
		PACKAGES+=("$pkg_name")
	fi
done

echo "Found ${#PACKAGES[@]} packages to pack:"
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

# Verify packages are built
echo "Verifying packages are built..."
FAILED=0
for pkg in "${PACKAGES[@]}"; do
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
