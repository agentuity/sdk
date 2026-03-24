#!/bin/bash
# Framework Demo Tests - Playwright E2E Tests for TanStack, Next.js, and Vite RSC Integration
# Tests the frontend framework integration demos with Agentuity
#
# Optimized: Starts all servers in parallel, then runs all tests in parallel

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "╔════════════════════════════════════════════════╗"
echo "║  Framework Demo Tests                          ║"
echo "║  TanStack & Next.js & Vite RSC                 ║"
echo "╚════════════════════════════════════════════════╝"
echo ""

# Parse arguments
RUN_TANSTACK=true
RUN_NEXTJS=true
RUN_VITE_RSC=true
SKIP_BUILD=false

while [[ $# -gt 0 ]]; do
	case $1 in
		--tanstack-only)
			RUN_NEXTJS=false
			RUN_VITE_RSC=false
			shift
			;;
		--nextjs-only)
			RUN_TANSTACK=false
			RUN_VITE_RSC=false
			shift
			;;
		--vite-rsc-only)
			RUN_TANSTACK=false
			RUN_NEXTJS=false
			shift
			;;
		--skip-build)
			SKIP_BUILD=true
			shift
			;;
		*)
			echo "Unknown option: $1"
			exit 1
			;;
	esac
done

# Cleanup function
cleanup() {
	echo ""
	echo "Cleaning up..."
	# Kill all server PIDs
	for pid in $TANSTACK_PID $NEXTJS_PID $VITE_RSC_PID; do
		if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
			kill "$pid" 2>/dev/null || true
		fi
	done
	# Kill any remaining processes on the ports
	for port in 3000 3001 3002 3500 3501 3502; do
		lsof -ti:$port | xargs kill -9 2>/dev/null || true
	done
}
trap cleanup EXIT

if [ "$SKIP_BUILD" = false ]; then
	# Step 1: Build SDK packages
	echo "Step 1: Building SDK packages..."
	bash "$SCRIPT_DIR/build-sdk.sh"
	echo ""
fi

# Function to wait for server (with timeout)
wait_for_server() {
	local url=$1
	local name=$2
	local max_attempts=${3:-60}
	local attempt=0
	
	while [ $attempt -lt $max_attempts ]; do
		if curl -s "$url" > /dev/null 2>&1; then
			echo "✓ $name is ready"
			return 0
		fi
		attempt=$((attempt + 1))
		sleep 1
	done
	echo "✗ $name failed to start after ${max_attempts}s"
	return 1
}

# Build list of projects to test
PROJECTS=()
if [ "$RUN_TANSTACK" = true ]; then
	PROJECTS+=("tanstack")
fi
if [ "$RUN_NEXTJS" = true ]; then
	PROJECTS+=("nextjs")
fi
if [ "$RUN_VITE_RSC" = true ]; then
	PROJECTS+=("vite-rsc")
fi

if [ ${#PROJECTS[@]} -eq 0 ]; then
	echo "No projects selected for testing"
	exit 1
fi

echo "Projects to test: ${PROJECTS[*]}"
echo ""

# Step 2: Start all servers in parallel
echo "Step 2: Starting all dev servers in parallel..."

if [ "$RUN_TANSTACK" = true ]; then
	echo "  Starting TanStack app..."
	cd "$SDK_ROOT/apps/testing/tanstack-start"
	bun run dev &
	TANSTACK_PID=$!
	cd "$SDK_ROOT"
fi

if [ "$RUN_NEXTJS" = true ]; then
	echo "  Starting Next.js app..."
	cd "$SDK_ROOT/apps/testing/nextjs-app"
	bun run dev &
	NEXTJS_PID=$!
	cd "$SDK_ROOT"
fi

if [ "$RUN_VITE_RSC" = true ]; then
	echo "  Starting Vite RSC app..."
	cd "$SDK_ROOT/apps/testing/vite-rsc-app"
	bun run dev &
	VITE_RSC_PID=$!
	cd "$SDK_ROOT"
fi

echo ""
echo "Waiting for all servers to be ready..."

# Wait for all servers in parallel (print status as they become ready)
WAIT_FAILURE=0

if [ "$RUN_TANSTACK" = true ]; then
	wait_for_server "http://localhost:3000" "TanStack web (3000)" 90 || WAIT_FAILURE=1
	wait_for_server "http://localhost:3500" "TanStack agent (3500)" 30 || WAIT_FAILURE=1
fi

if [ "$RUN_NEXTJS" = true ]; then
	wait_for_server "http://localhost:3001" "Next.js web (3001)" 90 || WAIT_FAILURE=1
	wait_for_server "http://localhost:3501" "Next.js agent (3501)" 30 || WAIT_FAILURE=1
fi

if [ "$RUN_VITE_RSC" = true ]; then
	wait_for_server "http://localhost:3002" "Vite RSC web (3002)" 90 || WAIT_FAILURE=1
	wait_for_server "http://localhost:3502" "Vite RSC agent (3502)" 30 || WAIT_FAILURE=1
fi

if [ $WAIT_FAILURE -eq 1 ]; then
	echo ""
	echo "✗ One or more servers failed to start"
	exit 1
fi

echo ""
echo "✓ All servers are ready"
echo ""

# Step 3: Run Playwright tests for all projects in one command
# Playwright will run projects in parallel based on config (workers: 3)
echo "Step 3: Running Playwright tests for all projects..."
echo ""

PROJECT_ARGS=""
for proj in "${PROJECTS[@]}"; do
	PROJECT_ARGS="$PROJECT_ARGS --project=$proj"
done

cd "$SDK_ROOT"
bun run playwright test --config=playwright.frameworks.config.ts $PROJECT_ARGS

echo ""
echo "╔════════════════════════════════════════════════╗"
echo "║  ✅ Framework Demo Tests Complete              ║"
echo "╚════════════════════════════════════════════════╝"