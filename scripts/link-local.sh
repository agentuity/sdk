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

# Remove lock file to avoid stale resolutions
echo "Removing lock files..."
rm -f bun.lock bun.lockb

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

# Remove any nested node_modules inside @agentuity packages
# These can cause version conflicts when Bun hoists incorrectly
echo "Removing nested node_modules in @agentuity packages..."
for pkg in node_modules/@agentuity/*/node_modules; do
	if [ -d "$pkg" ]; then
		echo "  Removing: $pkg"
		rm -rf "$pkg"
	fi
done

# Update package.json scripts to use the locally-linked CLI binary.
# After `bun install`, the @agentuity/cli tarball lands in the
# target's node_modules and its `bin` field exposes `agentuity` at
# node_modules/.bin/agentuity, which Bun automatically puts on PATH
# when running scripts. So `agentuity build` resolves to the same
# binary an end user gets after `npm install -g`.
echo ""
echo "🔧 Updating package.json scripts to use linked agentuity binary..."
bun -e "
	const fs = require('fs');
	const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
	if (!pkg.scripts) pkg.scripts = {};
	pkg.scripts.build = 'agentuity build';
	pkg.scripts.dev = 'agentuity dev';
	pkg.scripts.deploy = 'agentuity deploy';
	fs.writeFileSync('package.json', JSON.stringify(pkg, null, 3) + '\n');
	console.log('  ✓ Updated build/dev/deploy scripts to use \\'agentuity\\'');
"


echo ""
echo "✅ Local SDK packages linked successfully!"
echo ""
echo "Installed packages:"
for pkg in core schema frontend server react postgres drizzle runtime cli workbench auth; do
	if [ -d "node_modules/@agentuity/$pkg" ]; then
		echo "  ✓ @agentuity/$pkg"
	fi
done
echo ""
echo "Run 'bun run dev' or 'bun run build' to test with the local SDK changes."
