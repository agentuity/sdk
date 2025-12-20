#!/bin/bash
# Run E2E Web Tests
# Expects SDK packages to be pre-built and packed (run prepare-sdk-for-testing.sh first)
# This is the lightweight version used by test:ci to avoid redundant builds

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Verify tarballs exist
if [ ! -d "$SDK_ROOT/dist/packages" ] || [ -z "$(ls -A "$SDK_ROOT/dist/packages"/*.tgz 2>/dev/null)" ]; then
	echo "❌ ERROR: SDK packages not prepared"
	echo "Run: bash scripts/prepare-sdk-for-testing.sh"
	exit 1
fi

# Install SDK in e2e-web
bash "$SCRIPT_DIR/install-sdk-tarballs.sh" apps/testing/e2e-web

# Build e2e-web app
echo ""
echo "Building e2e-web app..."
cd "$SDK_ROOT/apps/testing/e2e-web"
bun run build

# Run Playwright tests
echo ""
echo "Running Playwright E2E tests..."
cd "$SDK_ROOT"
bun run test:e2e
