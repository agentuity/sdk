#!/bin/bash
# Run Cloud Deployment Tests
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

# Install SDK in cloud-deployment
bash "$SCRIPT_DIR/install-sdk-tarballs.sh" apps/testing/cloud-deployment

# Run cloud deployment tests
cd "$SDK_ROOT/apps/testing/cloud-deployment"
bash scripts/test-deployment.sh
