#!/bin/bash
set -e

if [ -z "$1" ]; then
	echo "❌ Error: Target directory is required"
	echo "Usage: $0 <target-directory>"
	exit 1
fi

TARGET_DIR="$(cd "$1" && pwd)"

echo "📦 Building and packing workbench package for local development to $TARGET_DIR..."

cd "$(dirname "$0")/.."
SDK_ROOT=$(pwd)

# Generate unique version with timestamp
TIMESTAMP=$(date +%s)
DEV_VERSION="0.0.86-dev.$TIMESTAMP"

# Function to update and restore package version
update_version() {
	local pkg_dir="$1"
	local new_version="$2"
	local pkg_file="$pkg_dir/package.json"
	
	# Store original version
	local original_version=$(node -p "require('$pkg_file').version")
	
	# Update version
	node -e "
		const fs = require('fs');
		const pkg = JSON.parse(fs.readFileSync('$pkg_file', 'utf8'));
		pkg.version = '$new_version';
		fs.writeFileSync('$pkg_file', JSON.stringify(pkg, null, '\t') + '\n');
	"
	
	echo "$original_version"
}

restore_version() {
	local pkg_dir="$1"
	local original_version="$2"
	local pkg_file="$pkg_dir/package.json"
	
	node -e "
		const fs = require('fs');
		const pkg = JSON.parse(fs.readFileSync('$pkg_file', 'utf8'));
		pkg.version = '$original_version';
		fs.writeFileSync('$pkg_file', JSON.stringify(pkg, null, '\t') + '\n');
	"
}

# Build workbench and its dependencies (core, react)
echo "🔨 Building packages..."
cd "$SDK_ROOT/packages/core"
bun run build

cd "$SDK_ROOT/packages/frontend"
bun run build

cd "$SDK_ROOT/packages/react"
bun run build

cd "$SDK_ROOT/packages/workbench"
bun run build

# Create temp directory for tarballs
TEMP_DIR=$(mktemp -d)
echo "📁 Using temp directory: $TEMP_DIR"

# Update versions and pack each package
echo "📦 Packing packages with version $DEV_VERSION..."

cd "$SDK_ROOT/packages/core"
CORE_ORIGINAL=$(update_version "$SDK_ROOT/packages/core" "$DEV_VERSION")
CORE_PKG=$(bun pm pack --destination "$TEMP_DIR" --quiet | xargs basename)
restore_version "$SDK_ROOT/packages/core" "$CORE_ORIGINAL"
echo "  - core: $CORE_PKG"

cd "$SDK_ROOT/packages/frontend"
FRONTEND_ORIGINAL=$(update_version "$SDK_ROOT/packages/frontend" "$DEV_VERSION")
FRONTEND_PKG=$(bun pm pack --destination "$TEMP_DIR" --quiet | xargs basename)
restore_version "$SDK_ROOT/packages/frontend" "$FRONTEND_ORIGINAL"
echo "  - frontend: $FRONTEND_PKG"

cd "$SDK_ROOT/packages/react"
REACT_ORIGINAL=$(update_version "$SDK_ROOT/packages/react" "$DEV_VERSION")
REACT_PKG=$(bun pm pack --destination "$TEMP_DIR" --quiet | xargs basename)
restore_version "$SDK_ROOT/packages/react" "$REACT_ORIGINAL"
echo "  - react: $REACT_PKG"

cd "$SDK_ROOT/packages/workbench"
WORKBENCH_ORIGINAL=$(update_version "$SDK_ROOT/packages/workbench" "$DEV_VERSION")
WORKBENCH_PKG=$(bun pm pack --destination "$TEMP_DIR" --quiet | xargs basename)
restore_version "$SDK_ROOT/packages/workbench" "$WORKBENCH_ORIGINAL"
echo "  - workbench: $WORKBENCH_PKG"

# Install in target directory
echo ""
echo "📥 Installing workbench in $TARGET_DIR..."
cd "$TARGET_DIR"

bun rm @agentuity/workbench 2>/dev/null || true
bun rm @agentuity/frontend 2>/dev/null || true
bun rm @agentuity/react 2>/dev/null || true
bun rm @agentuity/core 2>/dev/null || true

# Extract tarballs directly into node_modules to avoid npm registry resolution
mkdir -p node_modules/@agentuity

for pkg in "$CORE_PKG" "$FRONTEND_PKG" "$REACT_PKG" "$WORKBENCH_PKG"; do
  pkg_name=$(echo "$pkg" | sed 's/agentuity-//' | sed 's/-0.0.*\.tgz//')
  tar -xzf "$TEMP_DIR/$pkg" -C node_modules/@agentuity
  mv node_modules/@agentuity/package "node_modules/@agentuity/$pkg_name"
  echo "  ✓ Extracted $pkg_name"
done

# Run bun install to link peer dependencies
bun install

# Cleanup nested @agentuity packages (ensures proper resolution)
echo ""
echo "🧹 Cleaning nested @agentuity packages..."
for pkg in workbench react web core; do
    if [ -d "node_modules/@agentuity/$pkg/node_modules/@agentuity" ]; then
        echo "  - Removing node_modules/@agentuity/$pkg/node_modules/@agentuity"
        rm -rf "node_modules/@agentuity/$pkg/node_modules/@agentuity"
    fi
done

# Cleanup
rm -rf "$TEMP_DIR"

echo ""
echo "✅ Local workbench package installed successfully!"
echo ""
echo "Run 'bun run build' in your test app to rebuild with the local changes."
