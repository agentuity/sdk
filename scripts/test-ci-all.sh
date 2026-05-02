#!/bin/bash
# Run All CI Tests (Optimized)
# Prepares SDK once, then runs all test suites
# Use this to run the full CI suite locally

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "╔════════════════════════════════════════════════╗"
echo "║  Running All CI Tests (Optimized)             ║"
echo "╚════════════════════════════════════════════════╝"
echo ""

# Prepare SDK once (build + pack)
bash "$SCRIPT_DIR/prepare-sdk-for-testing.sh"

echo ""
echo "════════════════════════════════════════════════"
echo "Running test suites..."
echo "════════════════════════════════════════════════"
echo ""

# Run integration tests
echo "▶ Integration Suite"
echo "────────────────────────────────────────────────"
bash "$SCRIPT_DIR/run-integration-tests.sh"

echo ""
echo "▶ Cloud Deployment Tests"
echo "────────────────────────────────────────────────"
bash "$SCRIPT_DIR/run-cloud-tests.sh"

echo ""
echo "▶ E2E Web Tests"
echo "────────────────────────────────────────────────"
bash "$SCRIPT_DIR/run-e2e-tests.sh"

echo ""
echo "╔════════════════════════════════════════════════╗"
echo "║  ✅ All CI Tests Complete                      ║"
echo "╚════════════════════════════════════════════════╝"
