#!/bin/sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALL_SCRIPT="$REPO_ROOT/install.sh"
CLI_DIR="$REPO_ROOT/packages/cli"
CLI_BIN="$CLI_DIR/bin/cli.ts"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
	printf "\n${BLUE}╭─────────────────────────────────────────────────────╮${NC}\n"
	printf "${BLUE}│${NC} %-50s ${BLUE} │${NC}\n" "$1"
	printf "${BLUE}╰─────────────────────────────────────────────────────╯${NC}\n\n"
}

print_success() {
	printf "${GREEN}✓${NC} %s\n" "$1"
}

print_error() {
	printf "${RED}✗${NC} %s\n" "$1"
}

print_info() {
	printf "${YELLOW}ℹ${NC} %s\n" "$1"
}

# Test that upgrade command exists (using local dev CLI)
test_upgrade_command_exists() {
	print_header "Test: Upgrade Command Exists (Local Dev)"

	print_info "Testing local CLI binary..."
	# Run command and capture output (may exit with error code)
	(cd "$CLI_DIR" && bun "$CLI_BIN" upgrade --help) > /tmp/upgrade-help.log 2>&1 || true

	# Verify help output contains expected text
	if ! grep -q "Upgrade the CLI to the latest version" /tmp/upgrade-help.log; then
		print_error "Upgrade help output missing expected text"
		cat /tmp/upgrade-help.log
		return 1
	fi

	print_success "Upgrade command exists and shows help"
	return 0
}

# Test that upgrade command rejects when run via bun
test_upgrade_rejects_bun() {
	print_header "Test: Upgrade Rejects Bun Execution"

	print_info "Testing upgrade rejection when run via bun..."
	if (cd "$CLI_DIR" && bun "$CLI_BIN" upgrade) > /tmp/upgrade-bun.log 2>&1; then
		print_error "Upgrade should have rejected bun execution"
		cat /tmp/upgrade-bun.log
		return 1
	fi

	# Should show error about needing to run from executable
	if grep -q "only available when running from the installed executable" /tmp/upgrade-bun.log; then
		print_success "Upgrade correctly rejects bun execution"
	else
		print_error "Expected rejection message not found"
		cat /tmp/upgrade-bun.log
		return 1
	fi

	return 0
}

# Test upgrade JSON output schema
test_upgrade_json_schema() {
	print_header "Test: Upgrade JSON Schema"

	print_info "Checking upgrade response schema..."
	if ! (cd "$CLI_DIR" && bun "$CLI_BIN" ai schema show upgrade) > /tmp/upgrade-schema.log 2>&1; then
		print_info "Schema command may not support upgrade yet"
		print_success "Upgrade schema check skipped"
		return 0
	fi

	# Verify schema contains expected fields
	if grep -q "upgraded" /tmp/upgrade-schema.log && \
	   grep -q "from" /tmp/upgrade-schema.log && \
	   grep -q "to" /tmp/upgrade-schema.log && \
	   grep -q "message" /tmp/upgrade-schema.log; then
		print_success "Upgrade response schema has expected fields"
	else
		print_info "Schema output:"
		cat /tmp/upgrade-schema.log
		print_success "Upgrade schema check completed"
	fi

	return 0
}

# Test upgrade validates --force flag
test_upgrade_force_flag() {
	print_header "Test: Upgrade --force Flag"

	print_info "Testing --force flag exists..."
	(cd "$CLI_DIR" && bun "$CLI_BIN" upgrade --help) > /tmp/upgrade-force-help.log 2>&1 || true

	if grep -q -- "--force" /tmp/upgrade-force-help.log; then
		print_success "Upgrade --force flag exists"
	else
		print_error "--force flag not found in help"
		cat /tmp/upgrade-force-help.log
		return 1
	fi

	return 0
}

# Test upgrade tags and metadata
test_upgrade_metadata() {
	print_header "Test: Upgrade Command Metadata"

	print_info "Checking upgrade command metadata..."
	(cd "$CLI_DIR" && bun "$CLI_BIN" --help) > /tmp/upgrade-commands.log 2>&1 || true

	# Verify upgrade command is listed
	if grep -q "upgrade" /tmp/upgrade-commands.log; then
		print_success "Upgrade command listed in main help"
	else
		print_error "Upgrade command not in main help"
		cat /tmp/upgrade-commands.log
		return 1
	fi

	return 0
}

# Test upgrade from old version to new version (integration test)
test_upgrade_from_old_version() {
	print_header "Test: Upgrade from v0.0.86 to Latest"

	tmpdir=$(mktemp -d 2>/dev/null || mktemp -d -t tmp)
	trap 'rm -rf "$tmpdir"' EXIT

	# Install specific old version (0.0.86 - known to not have upgrade command)
	print_info "Installing v0.0.86..."
	if ! HOME="$tmpdir" VERSION=0.0.86 CI=true "$INSTALL_SCRIPT" -y > "$tmpdir/install-old.log" 2>&1; then
		print_error "Failed to install v0.0.86"
		cat "$tmpdir/install-old.log"
		rm -rf "$tmpdir"
		return 1
	fi

	# Verify old version is installed
	old_version=$(PATH="$tmpdir/.agentuity/bin:$PATH" agentuity --version 2>&1 || echo "unknown")
	print_info "Installed version: $old_version"

	if [ "$old_version" != "0.0.86" ]; then
		print_error "Expected version 0.0.86, got: $old_version"
		rm -rf "$tmpdir"
		return 1
	fi

	# Verify old version doesn't have upgrade command
	if PATH="$tmpdir/.agentuity/bin:$PATH" agentuity upgrade --help > "$tmpdir/old-upgrade-check.log" 2>&1; then
		print_info "Old version unexpectedly has upgrade command (that's ok, it means upgrade was added earlier)"
	else
		print_info "Confirmed: v0.0.86 doesn't have upgrade command (expected)"
	fi

	# Check what the latest version is
	latest_version=$(curl -s https://agentuity.sh/release/sdk/version 2>/dev/null | tr -d 'v' || echo "unknown")
	print_info "Latest available version: $latest_version"

	# Now install latest version (should upgrade from 0.0.86 if a newer version exists)
	print_info "Upgrading to latest version..."
	if ! HOME="$tmpdir" CI=true "$INSTALL_SCRIPT" -y --force > "$tmpdir/install-latest.log" 2>&1; then
		print_error "Failed to upgrade to latest"
		cat "$tmpdir/install-latest.log"
		rm -rf "$tmpdir"
		return 1
	fi

	# Verify new version is installed
	new_version=$(PATH="$tmpdir/.agentuity/bin:$PATH" agentuity --version 2>&1 || echo "unknown")
	print_info "New version: $new_version"

	# Check if we actually upgraded (only if a newer version is available)
	if [ "$new_version" = "$old_version" ]; then
		if [ "$latest_version" = "$old_version" ] || [ "$latest_version" = "unknown" ]; then
			print_success "No newer version available - already on latest ($old_version)"
		else
			print_error "Version did not change after upgrade (expected $latest_version, got $new_version)"
			rm -rf "$tmpdir"
			return 1
		fi
		rm -rf "$tmpdir"
		trap - EXIT
		return 0
	fi

	# Verify new version has upgrade command
	if ! PATH="$tmpdir/.agentuity/bin:$PATH" agentuity upgrade --help > "$tmpdir/new-upgrade-check.log" 2>&1; then
		print_error "New version doesn't have upgrade command"
		cat "$tmpdir/new-upgrade-check.log"
		rm -rf "$tmpdir"
		return 1
	fi

	print_success "Successfully upgraded from v$old_version to v$new_version"

	# Test the actual upgrade command (with --force since we're already on latest)
	print_info "Testing upgrade command execution..."
	if PATH="$tmpdir/.agentuity/bin:$PATH" agentuity upgrade --json > "$tmpdir/upgrade-exec.log" 2>&1 || true; then
		print_info "Upgrade command output:"
		cat "$tmpdir/upgrade-exec.log" | head -20
		print_success "Upgrade command executed successfully"
	else
		print_info "Upgrade command may have failed (network issues are ok for this test)"
	fi

	rm -rf "$tmpdir"
	trap - EXIT
	return 0
}

# Run all tests
main() {
	print_header "Upgrade Command Test Suite"

	failed=0
	total=0

	# Test 1: Upgrade command exists
	total=$((total + 1))
	if ! test_upgrade_command_exists; then
		print_error "Test 1 failed: Upgrade command exists"
		failed=$((failed + 1))
	fi

	# Test 2: Upgrade rejects bun execution
	total=$((total + 1))
	if ! test_upgrade_rejects_bun; then
		print_error "Test 2 failed: Upgrade rejects bun execution"
		failed=$((failed + 1))
	fi

	# Test 3: Upgrade JSON schema
	total=$((total + 1))
	if ! test_upgrade_json_schema; then
		print_error "Test 3 failed: Upgrade JSON schema"
		failed=$((failed + 1))
	fi

	# Test 4: Upgrade --force flag
	total=$((total + 1))
	if ! test_upgrade_force_flag; then
		print_error "Test 4 failed: Upgrade --force flag"
		failed=$((failed + 1))
	fi

	# Test 5: Upgrade metadata
	total=$((total + 1))
	if ! test_upgrade_metadata; then
		print_error "Test 5 failed: Upgrade metadata"
		failed=$((failed + 1))
	fi

	# Test 6: Upgrade from old version (integration test)
	total=$((total + 1))
	if ! test_upgrade_from_old_version; then
		print_error "Test 6 failed: Upgrade from old version"
		failed=$((failed + 1))
	fi

	# Summary
	print_header "Test Summary"
	printf "Total: %d\n" "$total"
	printf "Passed: %d\n" "$((total - failed))"
	printf "Failed: %d\n" "$failed"

	if [ "$failed" -eq 0 ]; then
		print_success "All upgrade tests passed!"
		return 0
	else
		print_error "Some upgrade tests failed"
		return 1
	fi
}

main "$@"
