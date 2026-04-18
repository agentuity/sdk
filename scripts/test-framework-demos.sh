#!/bin/bash
# Framework Demo Tests - Playwright E2E Tests for TanStack, Next.js, and SvelteKit Integration
# Tests the frontend framework integration demos with Agentuity

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"


echo "╔════════════════════════════════════════════════╗"
echo "║  Framework Demo Tests                          ║"
echo "║  TanStack & Next.js & SvelteKit                ║"
echo "║  (via agentuity dev)                           ║"
echo "╚════════════════════════════════════════════════╝"
echo ""

# Parse arguments
RUN_TANSTACK=true
RUN_NEXTJS=true
RUN_SVELTE=true
SKIP_BUILD=false

while [[ $# -gt 0 ]]; do
	case $1 in
		--tanstack-only)
			RUN_NEXTJS=false
			RUN_SVELTE=false
			shift
			;;
		--nextjs-only)
			RUN_TANSTACK=false
			RUN_SVELTE=false
			shift
			;;
		--svelte-only)
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
	if [ -n "$TANSTACK_PID" ]; then
		kill $TANSTACK_PID 2>/dev/null || true
	fi
	if [ -n "$NEXTJS_PID" ]; then
		kill $NEXTJS_PID 2>/dev/null || true
	fi
	if [ -n "$SVELTE_PID" ]; then
		kill $SVELTE_PID 2>/dev/null || true
	fi
	# Kill any remaining processes on the port
	lsof -ti:3000 | xargs kill -9 2>/dev/null || true
}
trap cleanup EXIT

if [ "$SKIP_BUILD" = false ]; then
	# Step 1: Build SDK packages
	echo "Step 1: Building SDK packages..."
	bash "$SCRIPT_DIR/build-sdk.sh"
	echo ""
fi

# Function to wait for server
wait_for_server() {
	local url=$1
	local name=$2
	local max_attempts=60
	local attempt=0
	
	echo "Waiting for $name at $url..."
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

# Run TanStack tests
if [ "$RUN_TANSTACK" = true ]; then
	echo "═══════════════════════════════════════════════"
	echo "  Testing TanStack Start + Agentuity"
	echo "═══════════════════════════════════════════════"
	echo ""
	
	# Start TanStack app
	echo "Starting TanStack app..."
	cd "$SDK_ROOT/apps/testing/tanstack-start"
	bun run dev &
	TANSTACK_PID=$!
	
	# Wait for web server
	wait_for_server "http://localhost:3000" "TanStack (3000)"
	
	# Run Playwright tests for TanStack
	echo ""
	echo "Running Playwright tests for TanStack..."
	cd "$SDK_ROOT"
	bun run playwright test --config=playwright.frameworks.config.ts --project=tanstack
	
	# Stop TanStack
	kill $TANSTACK_PID 2>/dev/null || true
	TANSTACK_PID=""
	lsof -ti:3000 | xargs kill -9 2>/dev/null || true
	sleep 2
	
	echo ""
	echo "✓ TanStack tests completed"
	echo ""
fi

# Run Next.js tests
if [ "$RUN_NEXTJS" = true ]; then
	echo "═══════════════════════════════════════════════"
	echo "  Testing Next.js + Agentuity"
	echo "═══════════════════════════════════════════════"
	echo ""
	
	# Start Next.js app
	echo "Starting Next.js app..."
	cd "$SDK_ROOT/apps/testing/nextjs-app"
	bun run dev &
	NEXTJS_PID=$!
	
	# Wait for web server
	wait_for_server "http://localhost:3000" "Next.js (3000)"
	
	# Run Playwright tests for Next.js
	echo ""
	echo "Running Playwright tests for Next.js..."
	cd "$SDK_ROOT"
	bun run playwright test --config=playwright.frameworks.config.ts --project=nextjs
	
	# Stop Next.js
	kill $NEXTJS_PID 2>/dev/null || true
	NEXTJS_PID=""
	lsof -ti:3000 | xargs kill -9 2>/dev/null || true
	sleep 2
	
	echo ""
	echo "✓ Next.js tests completed"
	echo ""
fi

# Run SvelteKit tests
if [ "$RUN_SVELTE" = true ]; then
	echo "═══════════════════════════════════════════════"
	echo "  Testing SvelteKit + Agentuity"
	echo "═══════════════════════════════════════════════"
	echo ""
	
	# Start SvelteKit app
	echo "Starting SvelteKit app..."
	cd "$SDK_ROOT/apps/testing/svelte-web"
	bun run dev &
	SVELTE_PID=$!
	
	# Wait for web server
	wait_for_server "http://localhost:3000" "SvelteKit (3000)"
	
	# Run Playwright tests for SvelteKit
	echo ""
	echo "Running Playwright tests for SvelteKit..."
	cd "$SDK_ROOT"
	bun run playwright test --config=playwright.frameworks.config.ts --project=svelte
	
	# Stop SvelteKit
	kill $SVELTE_PID 2>/dev/null || true
	SVELTE_PID=""
	lsof -ti:3000 | xargs kill -9 2>/dev/null || true
	
	echo ""
	echo "✓ SvelteKit tests completed"
	echo ""
fi

echo "╔════════════════════════════════════════════════╗"
echo "║  ✅ Framework Demo Tests Complete              ║"
echo "╚════════════════════════════════════════════════╝"
