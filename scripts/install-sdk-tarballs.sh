#!/bin/bash
# Install SDK tarballs in a test app
# Usage: bash scripts/install-sdk-tarballs.sh <app-dir>
# Example: bash scripts/install-sdk-tarballs.sh apps/testing/integration-suite

set -e

if [ -z "$1" ]; then
	echo "❌ ERROR: App directory required"
	echo "Usage: bash scripts/install-sdk-tarballs.sh <app-dir>"
	echo "Example: bash scripts/install-sdk-tarballs.sh apps/testing/integration-suite"
	exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$1"
TARBALL_DIR="$SDK_ROOT/dist/packages"

echo "📥 Installing SDK Tarballs"
echo "=========================="
echo "App: $APP_DIR"
echo ""

# Verify tarballs exist
if [ ! -d "$TARBALL_DIR" ] || [ -z "$(ls -A "$TARBALL_DIR"/*.tgz 2>/dev/null)" ]; then
	echo "❌ ERROR: No tarballs found in $TARBALL_DIR"
	echo "Run: bash scripts/pack-sdk.sh"
	exit 1
fi

echo "Found tarballs:"
ls -1 "$TARBALL_DIR"/*.tgz | xargs -n1 basename
echo ""

# Navigate to app directory
cd "$SDK_ROOT/$APP_DIR"

# Remove existing node_modules completely for clean install
echo "Removing existing node_modules for clean install..."
rm -rf node_modules

# Clear ALL Bun caches to ensure fresh install from tarballs
echo "Clearing Bun caches for clean install..."
# Clear local monorepo cache (root node_modules/.bun)
rm -rf "$SDK_ROOT/node_modules/.bun"
# Clear global Bun cache
rm -rf "$HOME/.bun/install/cache"

# Backup package.json
cp package.json package.json.backup

# Replace workspace:* with file:... references
echo "Rewriting package.json to use tarball dependencies..."
for tarball in "$TARBALL_DIR"/agentuity-*.tgz; do
	filename=$(basename "$tarball")
	# Extract package name (e.g., agentuity-core-0.0.100.tgz -> @agentuity/core)
	pkg_base=$(echo "$filename" | sed 's/agentuity-//' | sed 's/-[0-9].*//')
	pkg_name="@agentuity/$pkg_base"
	
	# Replace workspace:* with file: reference
	sed -i.tmp "s|\"$pkg_name\": \"workspace:\\*\"|\"$pkg_name\": \"file:$tarball\"|g" package.json
done
rm -f package.json.tmp

# Install from modified package.json
echo "Installing SDK packages from tarballs..."
bun install

# Restore original package.json
mv package.json.backup package.json

echo ""
echo "✅ SDK packages installed in $APP_DIR"
echo ""

# Verify installation
echo "Verifying installation..."
if [ -d "node_modules/@agentuity/core" ]; then
	echo "  ✓ @agentuity/core"
fi
if [ -d "node_modules/@agentuity/runtime" ]; then
	echo "  ✓ @agentuity/runtime"
fi
if [ -d "node_modules/@agentuity/cli" ]; then
	echo "  ✓ @agentuity/cli"
fi

echo ""
echo "✅ Installation verified"
