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

# Build workbench package
echo "🔨 Building workbench package..."
cd packages/workbench
bun run build

# Create temp directory for tarball
TEMP_DIR=$(mktemp -d)
echo "📁 Using temp directory: $TEMP_DIR"

# Pack workbench package and capture filename
echo "📦 Packing workbench package..."
WORKBENCH_PKG=$(bun pm pack --destination "$TEMP_DIR" --quiet | xargs basename)
echo "  - workbench: $WORKBENCH_PKG"

# Detect package manager
echo ""
echo "🔍 Detecting package manager..."
cd "$TARGET_DIR"

if [ -f "bun.lockb" ]; then
	PKG_MGR="bun"
	INSTALL_CMD="bun add"
	REMOVE_CMD="bun remove"
elif [ -f "pnpm-lock.yaml" ]; then
	PKG_MGR="pnpm"
	INSTALL_CMD="pnpm add"
	REMOVE_CMD="pnpm remove"
elif [ -f "yarn.lock" ]; then
	PKG_MGR="yarn"
	INSTALL_CMD="yarn add"
	REMOVE_CMD="yarn remove"
elif [ -f "package-lock.json" ]; then
	PKG_MGR="npm"
	INSTALL_CMD="npm install"
	REMOVE_CMD="npm uninstall"
else
	PKG_MGR="npm"
	INSTALL_CMD="npm install"
	REMOVE_CMD="npm uninstall"
fi

echo "  - Using package manager: $PKG_MGR"

# Install in target directory
echo ""
echo "📥 Installing workbench package in $TARGET_DIR..."

$REMOVE_CMD @agentuity/workbench 2>/dev/null || true

$INSTALL_CMD "$TEMP_DIR/$WORKBENCH_PKG"

# Cleanup nested @agentuity packages (ensures proper resolution)
echo ""
echo "🧹 Cleaning nested @agentuity packages..."
if [ -d "node_modules/@agentuity/workbench/node_modules/@agentuity" ]; then
	echo "  - Removing node_modules/@agentuity/workbench/node_modules/@agentuity"
	rm -rf "node_modules/@agentuity/workbench/node_modules/@agentuity"
fi

# Cleanup
rm -rf "$TEMP_DIR"

echo ""
echo "✅ Workbench package installed successfully!"
echo ""
echo "The local workbench changes are now available in your app."
