#!/bin/bash
# Cloud Deployment - Full CI Test Flow
# Runs the complete CI workflow for cloud-deployment locally
# This is what runs in CI - use this to reproduce CI failures

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "╔════════════════════════════════════════════════╗"
echo "║  Cloud Deployment - Full CI Test Flow         ║"
echo "╚════════════════════════════════════════════════╝"
echo ""

# Step 1: Build SDK packages
echo "Step 1/4: Building SDK packages..."
bash "$SCRIPT_DIR/build-sdk.sh"
echo ""

# Step 2: Pack SDK packages
echo "Step 2/4: Packing SDK packages..."
bash "$SCRIPT_DIR/pack-sdk.sh"
echo ""

# Step 3: Install SDK in cloud-deployment
echo "Step 3/4: Installing SDK packages..."
bash "$SCRIPT_DIR/install-sdk-tarballs.sh" apps/testing/cloud-deployment
echo ""

# Step 4: Run cloud deployment tests
echo "Step 4/4: Running cloud deployment tests..."
cd "$SDK_ROOT/apps/testing/cloud-deployment"
bash scripts/test-deployment.sh
echo ""

echo "╔════════════════════════════════════════════════╗"
echo "║  ✅ Cloud Deployment Tests Complete            ║"
echo "╚════════════════════════════════════════════════╝"
