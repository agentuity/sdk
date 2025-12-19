#!/bin/bash
# CI Workspace Linker
# Ensures workspace packages are properly linked in CI environments where
# Bun.build may have trouble resolving workspace symlinks during bundling.
#
# This script:
# 1. Verifies all packages are built
# 2. Re-links workspace dependencies by creating direct symlinks
# 3. Cleans up nested @agentuity packages to avoid resolution conflicts
#
# Usage: scripts/ci-link-workspace.sh

set -e

cd "$(dirname "$0")/.."
SDK_ROOT=$(pwd)

echo "🔗 CI Workspace Linker"
echo "====================="
echo ""

# List of packages in dependency order
PACKAGES=(
	"core"
	"schema"
	"frontend"
	"server"
	"react"
	"auth"
	"workbench"
	"runtime"
	"cli"
)

# Verify all packages are built
echo "✓ Verifying packages are built..."
for pkg in "${PACKAGES[@]}"; do
	if [ ! -d "packages/$pkg/dist" ]; then
		echo "❌ Package @agentuity/$pkg is not built (missing dist/)"
		exit 1
	fi
done
echo "  All packages have dist/ folders"
echo ""

# Function to link packages in a target directory
link_packages_in_dir() {
	local target_dir=$1
	local desc=$2
	
	if [ ! -d "$target_dir" ]; then
		return
	fi
	
	echo "📦 Linking packages in $desc..."
	cd "$target_dir"
	
	# Create node_modules/@agentuity if it doesn't exist
	mkdir -p node_modules/@agentuity
	
	# Link each package
	for pkg in "${PACKAGES[@]}"; do
		local pkg_path="$SDK_ROOT/packages/$pkg"
		local link_path="node_modules/@agentuity/$pkg"
		
		# Remove existing link/directory
		rm -rf "$link_path"
		
		# Create symlink
		ln -s "$pkg_path" "$link_path"
	done
	
	# Clean up nested @agentuity packages to avoid resolution conflicts
	for pkg in "${PACKAGES[@]}"; do
		local nested_path="node_modules/@agentuity/$pkg/node_modules/@agentuity"
		if [ -d "$nested_path" ]; then
			rm -rf "$nested_path"
		fi
	done
	
	echo "  ✓ Linked ${#PACKAGES[@]} packages"
	cd "$SDK_ROOT"
}

# Link packages in all test apps
link_packages_in_dir "$SDK_ROOT/apps/testing/integration-suite" "integration-suite"
link_packages_in_dir "$SDK_ROOT/apps/testing/cloud-deployment" "cloud-deployment"
link_packages_in_dir "$SDK_ROOT/apps/testing/e2e-web" "e2e-web"

echo ""
echo "✅ Workspace packages linked successfully!"
echo ""
echo "Note: Run 'bun install' in each app to ensure peer dependencies are installed."
