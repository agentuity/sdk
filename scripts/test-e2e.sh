#!/bin/bash
# E2E Web Tests - Full CI Test Flow
# Runs the complete CI workflow for e2e-web locally
# This is what runs in CI - use this to reproduce CI failures

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "╔════════════════════════════════════════════════╗"
echo "║  E2E Web Tests - Full CI Test Flow            ║"
echo "╚════════════════════════════════════════════════╝"
echo ""

# Step 1: Build SDK packages
echo "Step 1/5: Building SDK packages..."
bash "$SCRIPT_DIR/build-sdk.sh"
echo ""

# Step 2: Pack SDK packages
echo "Step 2/5: Packing SDK packages..."
bash "$SCRIPT_DIR/pack-sdk.sh"
echo ""

# Step 3: Install SDK in e2e-web
echo "Step 3/5: Installing SDK packages..."
bash "$SCRIPT_DIR/install-sdk-tarballs.sh" apps/testing/e2e-web
echo ""

# Step 4: Build e2e-web app
echo "Step 4/5: Building e2e-web app..."
cd "$SDK_ROOT/apps/testing/e2e-web"
bun run build
echo ""

# Step 5: Run Playwright tests
echo "Step 5/5: Running Playwright E2E tests..."
cd "$SDK_ROOT"
bun run test:e2e
echo ""

echo "╔════════════════════════════════════════════════╗"
echo "║  ✅ E2E Web Tests Complete                     ║"
echo "╚════════════════════════════════════════════════╝"
