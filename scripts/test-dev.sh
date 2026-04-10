#!/bin/bash
# Test framework apps using `agentuity dev`
#
# Starts each framework testing app via the Agentuity CLI dev command
# and verifies it responds on port 3000. This exercises:
# - Framework detection
# - AI Gateway env injection
# - SDK key resolution (project .env or auth profile fallback)
#
# Usage:
#   bash scripts/test-dev.sh                # test all framework apps
#   bash scripts/test-dev.sh --app tanstack # test a specific app

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLI="$SDK_ROOT/packages/cli/bin/cli.ts"

# Framework apps to test (directory name under apps/testing/)
ALL_APPS=(tanstack-start nextjs-app vite-react-app)
SELECTED_APP=""

while [[ $# -gt 0 ]]; do
	case $1 in
		--app)
			SELECTED_APP="$2"
			shift 2
			;;
		*)
			echo "Unknown option: $1"
			echo "Usage: $0 [--app <name>]"
			exit 1
			;;
	esac
done

if [ -n "$SELECTED_APP" ]; then
	ALL_APPS=("$SELECTED_APP")
fi

# Cleanup function
cleanup() {
	if [ -n "$DEV_PID" ]; then
		kill $DEV_PID 2>/dev/null || true
	fi
	lsof -ti:3000 | xargs kill -9 2>/dev/null || true
}
trap cleanup EXIT

wait_for_server() {
	local url=$1
	local name=$2
	local max_attempts=60
	local attempt=0

	echo "  Waiting for $name at $url..."
	while [ $attempt -lt $max_attempts ]; do
		if curl -s "$url" > /dev/null 2>&1; then
			echo "  ✓ $name is ready"
			return 0
		fi
		attempt=$((attempt + 1))
		sleep 1
	done
	echo "  ✗ $name failed to start after ${max_attempts}s"
	return 1
}

echo "╔════════════════════════════════════════════════╗"
echo "║  Agentuity Dev Test                            ║"
echo "║  Testing framework apps via agentuity dev      ║"
echo "╚════════════════════════════════════════════════╝"
echo ""

PASSED=0
FAILED=0

for APP in "${ALL_APPS[@]}"; do
	APP_DIR="$SDK_ROOT/apps/testing/$APP"

	if [ ! -d "$APP_DIR" ]; then
		echo "⚠ Skipping $APP (directory not found)"
		echo ""
		continue
	fi

	echo "═══════════════════════════════════════════════"
	echo "  Testing: $APP"
	echo "═══════════════════════════════════════════════"

	# Kill anything on port 3000
	lsof -ti:3000 | xargs kill -9 2>/dev/null || true
	sleep 1

	# Start app via agentuity dev
	echo "  Starting via agentuity dev..."
	cd "$APP_DIR"
	"$CLI" dev &
	DEV_PID=$!

	# Wait for server
	if wait_for_server "http://localhost:3000" "$APP"; then
		echo "  ✓ $APP started successfully via agentuity dev"
		PASSED=$((PASSED + 1))
	else
		echo "  ✗ $APP failed to start"
		FAILED=$((FAILED + 1))
	fi

	# Stop
	kill $DEV_PID 2>/dev/null || true
	DEV_PID=""
	lsof -ti:3000 | xargs kill -9 2>/dev/null || true
	sleep 2

	echo ""
done

echo "╔════════════════════════════════════════════════╗"
if [ $FAILED -eq 0 ]; then
	echo "║  ✅ All $PASSED apps started successfully       ║"
else
	echo "║  ❌ $PASSED passed, $FAILED failed                    ║"
fi
echo "╚════════════════════════════════════════════════╝"

[ $FAILED -eq 0 ]
