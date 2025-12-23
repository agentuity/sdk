#!/bin/bash
# Link Local SDK Packages
# Builds, packs, and installs SDK packages into a target test project
# Reuses the same scripts used by CI for consistency
#
# Usage: ./scripts/link-local.sh <target-directory>
# Example: ./scripts/link-local.sh /Users/me/my-test-project

set -e

if [ -z "$1" ]; then
	echo "❌ Error: Target directory is required"
	echo "Usage: $0 <target-directory>"
	exit 1
fi

TARGET_DIR="$(cd "$1" && pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "📦 Linking local SDK packages to $TARGET_DIR..."
echo ""

# Step 1: Prepare SDK (build + pack)
bash "$SCRIPT_DIR/prepare-sdk-for-testing.sh"

# Step 2: Install tarballs into target directory
# We need to handle external directories differently than internal apps
TARBALL_DIR="$SDK_ROOT/dist/packages"

# Verify tarballs exist
if [ ! -d "$TARBALL_DIR" ] || [ -z "$(ls -A "$TARBALL_DIR"/*.tgz 2>/dev/null)" ]; then
	echo "❌ ERROR: No tarballs found in $TARBALL_DIR"
	exit 1
fi

echo ""
echo "📥 Installing SDK Tarballs into $TARGET_DIR"
echo "============================================"

# Navigate to target directory
cd "$TARGET_DIR"

# Remove existing @agentuity packages
echo "Removing existing @agentuity packages..."
rm -rf node_modules/@agentuity

# Clear Bun cache for clean install
echo "Clearing Bun cache..."
rm -rf "$HOME/.bun/install/cache"

# Add/update @agentuity dependencies to use tarball file references
echo "Rewriting package.json to use tarball dependencies..."
bun -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (!pkg.dependencies) pkg.dependencies = {};

const tarballs = fs.readdirSync('$TARBALL_DIR').filter(f => f.startsWith('agentuity-') && f.endsWith('.tgz'));
for (const tarball of tarballs) {
	// Extract package name (e.g., agentuity-core-0.0.101.tgz -> core)
	const pkgBase = tarball.replace('agentuity-', '').replace(/-[0-9].*/, '');
	const pkgName = '@agentuity/' + pkgBase;
	// Remove from devDependencies to avoid duplicates
	if (pkg.devDependencies && pkg.devDependencies[pkgName]) {
		delete pkg.devDependencies[pkgName];
	}
	pkg.dependencies[pkgName] = 'file:$TARBALL_DIR/' + tarball;
	console.log('  + ' + pkgName);
}

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 3) + '\n');
"

# Install from modified package.json
echo "Installing SDK packages from tarballs..."
bun install

# Update package.json scripts to use local CLI for development
echo ""
echo "🔧 Updating package.json scripts to use local CLI..."
CLI_PATH="$SDK_ROOT/packages/cli/bin/cli.ts"
bun -e "
	const fs = require('fs');
	const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
	if (!pkg.scripts) pkg.scripts = {};
	pkg.scripts.build = 'bun $CLI_PATH build';
	pkg.scripts.dev = 'bun $CLI_PATH dev';
	pkg.scripts.deploy = 'bun $CLI_PATH deploy';
	fs.writeFileSync('package.json', JSON.stringify(pkg, null, 3) + '\n');
	console.log('  ✓ Updated build and dev scripts to use $CLI_PATH');
"

echo ""
echo "✅ Local SDK packages linked successfully!"
echo ""
echo "Installed packages:"
for pkg in core schema frontend server react runtime cli workbench auth; do
	if [ -d "node_modules/@agentuity/$pkg" ]; then
		echo "  ✓ @agentuity/$pkg"
	fi
done
echo ""
echo "Run 'bun run dev' or 'bun run build' to test with the local SDK changes."
