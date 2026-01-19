#!/bin/bash
# Test Queue SDK Client
# Runs the standalone queue test app that exercises the Queue API via SDK

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
QUEUES_APP="$SDK_ROOT/apps/testing/queues"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "  Queue SDK Test"
echo "========================================"
echo ""

# Check if AGENTUITY_SDK_KEY is set
if [ -z "$AGENTUITY_SDK_KEY" ]; then
	echo -e "${RED}Error: AGENTUITY_SDK_KEY environment variable is not set${NC}"
	echo "Please set it to run the queue tests."
	exit 1
fi

# Set default region if not provided
if [ -z "$AGENTUITY_REGION" ]; then
	export AGENTUITY_REGION="usc"
	echo -e "${YELLOW}Using default region: $AGENTUITY_REGION${NC}"
fi

echo -e "${YELLOW}→ Installing dependencies...${NC}"
cd "$QUEUES_APP"
bun install --silent

echo -e "${YELLOW}→ Running queue SDK tests...${NC}"
echo ""

if bun run start; then
	echo ""
	echo -e "${GREEN}✅ Queue SDK tests passed!${NC}"
	exit 0
else
	echo ""
	echo -e "${RED}❌ Queue SDK tests failed!${NC}"
	exit 1
fi
