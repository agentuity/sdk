#!/bin/bash
# scripts/lib/ensure-cli-built.sh
#
# Source this from any test/smoke script that invokes the CLI as a
# built artifact (i.e. via `node packages/cli/bin/cli.js` or
# `bun packages/cli/bin/cli.js`).
#
# What it does:
#
#   1. Ensures `packages/cli/dist/main.js` and the copied non-TS
#      assets exist. If missing, runs `bun run build` at the SDK
#      root (which is a no-op when tsc's incremental cache is fresh).
#
#   2. Smoke-checks the artifact under BOTH supported runtimes
#      (bun and node), so callers can trust either invocation.
#
# Why we need this:
#
#   The CLI is intentionally runtime-agnostic — it must work under
#   Bun 1.3+ and Node 24+. Test scripts should exercise the SHIPPED
#   artifact, not the source TypeScript, so build-only regressions
#   (missing assets, Node runtime errors, dual-runtime bugs) surface
#   in CI instead of slipping through.
#
# Usage:
#
#   #!/bin/bash
#   set -e
#   SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
#   SDK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
#   source "$SDK_ROOT/scripts/lib/ensure-cli-built.sh"
#
#   # Default to node; let CI pick the runtime via env.
#   CLI_RUNTIME="${CLI_RUNTIME:-node}"
#   CLI="$CLI_RUNTIME $SDK_ROOT/packages/cli/bin/cli.js"
#
# Env vars:
#
#   AGENTUITY_SKIP_BUILD=1
#       Don't auto-build; error out if dist/ is missing. Useful in
#       CI where the build is its own step and any missing artifact
#       should be a loud failure.
#
#   AGENTUITY_SKIP_RUNTIME_CHECK=1
#       Don't smoke-check both runtimes. Useful when one runtime
#       isn't installed locally (e.g. a developer who only has Bun).

set -e

if [ -z "${SDK_ROOT:-}" ]; then
	_helper_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
	SDK_ROOT="$(cd "$_helper_dir/../.." && pwd)"
fi

_cli_dist_main="$SDK_ROOT/packages/cli/dist/main.js"
_cli_dist_template_marker="$SDK_ROOT/packages/cli/dist/cmd/project/templates/nextjs"
_cli_bin="$SDK_ROOT/packages/cli/bin/cli.js"

_needs_build=0
[ -f "$_cli_dist_main" ] || _needs_build=1
[ -d "$_cli_dist_template_marker" ] || _needs_build=1

if [ "$_needs_build" = "1" ]; then
	if [ "${AGENTUITY_SKIP_BUILD:-0}" = "1" ]; then
		echo "ERROR: CLI dist/ is missing or incomplete and AGENTUITY_SKIP_BUILD=1." >&2
		echo "       Expected: $_cli_dist_main" >&2
		echo "       Expected: $_cli_dist_template_marker" >&2
		echo "       Run \`bun run build\` at the SDK root before this script." >&2
		exit 1
	fi
	echo "→ CLI dist/ missing, building workspace (\`bun run build\` at $SDK_ROOT)..."
	(cd "$SDK_ROOT" && bun run build) || {
		echo "ERROR: workspace build failed; cannot run smoke tests." >&2
		exit 1
	}
fi

# Dual-runtime smoke check: the built artifact must load under
# both Bun and Node. Skip individual runtimes that aren't on PATH;
# only error if NEITHER works (which means the build is broken).
if [ "${AGENTUITY_SKIP_RUNTIME_CHECK:-0}" != "1" ]; then
	_runtime_failures=()
	_runtime_skipped=()

	for _rt in bun node; do
		if ! command -v "$_rt" >/dev/null 2>&1; then
			_runtime_skipped+=("$_rt (not on PATH)")
			continue
		fi
		if ! "$_rt" "$_cli_bin" --version >/dev/null 2>&1; then
			_runtime_failures+=("$_rt")
		fi
	done

	if [ ${#_runtime_failures[@]} -gt 0 ]; then
		echo "ERROR: built CLI failed to run under: ${_runtime_failures[*]}" >&2
		echo "       Try \`bun run clean && bun run build\` at $SDK_ROOT." >&2
		echo "       To diagnose, run e.g. \`${_runtime_failures[0]} $_cli_bin --version\` directly." >&2
		exit 1
	fi
	if [ ${#_runtime_skipped[@]} -gt 0 ]; then
		echo "→ Note: skipped runtime smoke for: ${_runtime_skipped[*]}"
	fi
fi
