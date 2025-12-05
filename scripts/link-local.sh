#!/bin/bash
set -e

if [ -z "$1" ]; then
	echo "❌ Error: Target directory is required"
	echo "Usage: $0 <target-directory>"
	exit 1
fi

TARGET_DIR="$1"

echo "📦 Building and packing SDK packages for local development..."

cd "$(dirname "$0")/.."
SDK_ROOT=$(pwd)

# Build all packages
echo "🔨 Building packages..."
bun run build

# Create temp directory for tarballs
TEMP_DIR=$(mktemp -d)
echo "📁 Using temp directory: $TEMP_DIR"

# Pack each package and capture filenames
echo "📦 Packing packages..."

cd "$SDK_ROOT/packages/core"
CORE_PKG=$(bun pm pack --destination "$TEMP_DIR" --quiet | xargs basename)
echo "  - core: $CORE_PKG"

cd "$SDK_ROOT/packages/schema"
SCHEMA_PKG=$(bun pm pack --destination "$TEMP_DIR" --quiet | xargs basename)
echo "  - schema: $SCHEMA_PKG"

cd "$SDK_ROOT/packages/server"
SERVER_PKG=$(bun pm pack --destination "$TEMP_DIR" --quiet | xargs basename)
echo "  - server: $SERVER_PKG"

cd "$SDK_ROOT/packages/react"
REACT_PKG=$(bun pm pack --destination "$TEMP_DIR" --quiet | xargs basename)
echo "  - react: $REACT_PKG"

cd "$SDK_ROOT/packages/runtime"
RUNTIME_PKG=$(bun pm pack --destination "$TEMP_DIR" --quiet | xargs basename)
echo "  - runtime: $RUNTIME_PKG"

cd "$SDK_ROOT/packages/cli"
CLI_PKG=$(bun pm pack --destination "$TEMP_DIR" --quiet | xargs basename)
echo "  - cli: $CLI_PKG"

cd "$SDK_ROOT/packages/workbench"
WORKBENCH_PKG=$(bun pm pack --destination "$TEMP_DIR" --quiet | xargs basename)
echo "  - workbench: $WORKBENCH_PKG"

# Install in target directory
echo ""
echo "📥 Installing in $TARGET_DIR..."
cd "$TARGET_DIR"

bun remove @agentuity/cli @agentuity/core @agentuity/react @agentuity/runtime @agentuity/schema @agentuity/server @agentuity/workbench 2>/dev/null || true

bun add "$TEMP_DIR/$CORE_PKG"
bun add "$TEMP_DIR/$SCHEMA_PKG"
bun add "$TEMP_DIR/$SERVER_PKG"
bun add "$TEMP_DIR/$REACT_PKG"
bun add "$TEMP_DIR/$RUNTIME_PKG"
bun add "$TEMP_DIR/$CLI_PKG"
bun add "$TEMP_DIR/$WORKBENCH_PKG"

# Cleanup nested @agentuity packages (ensures proper resolution)
echo ""
echo "🧹 Cleaning nested @agentuity packages..."
for pkg in runtime server cli schema react; do
    if [ -d "node_modules/@agentuity/$pkg/node_modules/@agentuity" ]; then
        echo "  - Removing node_modules/@agentuity/$pkg/node_modules/@agentuity"
        rm -rf "node_modules/@agentuity/$pkg/node_modules/@agentuity"
    fi
done

# Cleanup
rm -rf "$TEMP_DIR"

echo ""
echo "✅ Local SDK packages installed successfully!"
echo ""
echo "Run 'bun run build' in your test app to rebuild with the local changes."
