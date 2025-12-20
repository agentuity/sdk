#!/bin/bash
# Prepare SDK for Testing
# Builds and packs SDK packages once for use by all test suites
# Run this first, then run individual test scripts

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "╔════════════════════════════════════════════════╗"
echo "║  Preparing SDK for Testing                    ║"
echo "╚════════════════════════════════════════════════╝"
echo ""

# Step 1: Build SDK packages
echo "Step 1/2: Building SDK packages..."
bash "$SCRIPT_DIR/build-sdk.sh"
echo ""

# Step 2: Pack SDK packages
echo "Step 2/2: Packing SDK packages..."
bash "$SCRIPT_DIR/pack-sdk.sh"
echo ""

echo "╔════════════════════════════════════════════════╗"
echo "║  ✅ SDK Ready for Testing                      ║"
echo "╚════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  • bun run test:ci:integration (requires AGENTUITY_SDK_KEY)"
echo "  • bun run test:ci:cloud (requires cloud credentials)"
echo "  • bun run test:ci:e2e"
echo ""
echo "Or run all at once:"
echo "  • bun run test:ci (integration + e2e)"
echo "  • bun run test:ci:all (all tests)"
