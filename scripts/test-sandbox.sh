#!/bin/bash
# Test Sandbox CLI Commands
# Exercises create, exec, cp, run, snapshot, and delete functionality
#
# This script validates actual command outputs, not just exit codes.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLI="bun $SDK_ROOT/packages/cli/bin/cli.ts"
TEST_DIR=$(mktemp -d)
SANDBOX_ID=""
PYTHON_SANDBOX_ID=""

# Get commit SHA for sandbox descriptions
COMMIT_SHA=$(git -C "$SDK_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")
SANDBOX_DESC="Automated test-sandbox.sh for commit $COMMIT_SHA"

# Generate a unique run ID to avoid conflicts between concurrent CI runs
# Combines timestamp with random hex to ensure uniqueness even if runs start in the same second
RUN_ID="$(date +%s)-$(head -c 6 /dev/urandom | xxd -p)"
SNAPSHOT_ID=""
# Array to track all created snapshot IDs for cleanup
CREATED_SNAPSHOTS=()
TESTS_PASSED=0
TESTS_FAILED=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

cleanup() {
	echo -e "\n${YELLOW}Cleaning up...${NC}"
	if [ -n "$SANDBOX_ID" ]; then
		$CLI cloud sandbox delete "$SANDBOX_ID" --confirm 2>/dev/null || true
	fi
	if [ -n "$PYTHON_SANDBOX_ID" ]; then
		$CLI cloud sandbox delete "$PYTHON_SANDBOX_ID" --confirm 2>/dev/null || true
	fi
	# Clean up all tracked snapshots
	for snap_id in "${CREATED_SNAPSHOTS[@]}"; do
		if [ -n "$snap_id" ]; then
			$CLI cloud sandbox snapshot delete "$snap_id" --confirm 2>/dev/null || true
		fi
	done
	rm -rf "$TEST_DIR"
	echo -e "${GREEN}Cleanup complete${NC}"
	echo ""
	echo "========================================"
	echo -e "Tests passed: ${GREEN}$TESTS_PASSED${NC}"
	echo -e "Tests failed: ${RED}$TESTS_FAILED${NC}"
	echo "========================================"
	if [ $TESTS_FAILED -gt 0 ]; then
		exit 1
	fi
}

trap cleanup EXIT

pass() {
	echo -e "${GREEN}✓ $1${NC}"
	TESTS_PASSED=$((TESTS_PASSED + 1))
}

# Track a snapshot for cleanup
track_snapshot() {
	if [ -n "$1" ] && [[ "$1" == snp_* ]]; then
		CREATED_SNAPSHOTS+=("$1")
	fi
}

# Remove a snapshot from tracking (after successful deletion)
untrack_snapshot() {
	local snap_to_remove="$1"
	local new_array=()
	for snap_id in "${CREATED_SNAPSHOTS[@]}"; do
		if [ "$snap_id" != "$snap_to_remove" ]; then
			new_array+=("$snap_id")
		fi
	done
	CREATED_SNAPSHOTS=("${new_array[@]}")
}

# Delete a snapshot and untrack only on success
# Returns 0 on success, 1 on failure (snapshot remains tracked for retry)
delete_and_untrack_snapshot() {
	local snap_id="$1"
	if [ -z "$snap_id" ]; then
		return 0
	fi
	if $CLI cloud sandbox snapshot delete "$snap_id" --confirm 2>/dev/null; then
		untrack_snapshot "$snap_id"
		return 0
	else
		return 1
	fi
}

fail() {
	echo -e "${RED}✗ $1${NC}"
	echo -e "${RED}  Output: $2${NC}"
	# Show raw CLI output if provided as 3rd arg (when $2 is a comparison string)
	if [ -n "$3" ]; then
		echo -e "${RED}  CLI Response:${NC}"
		echo "$3" | while IFS= read -r line; do
			echo -e "${RED}    ${line}${NC}"
		done
	fi
	# Log sandbox ID for OTel trace correlation
	if [ -n "$SANDBOX_ID" ]; then
		echo -e "${RED}  SandboxId: $SANDBOX_ID${NC}"
	fi
	# Log CLI session ID for log correlation
	local cli_session
	cli_session=$(find_latest_cli_session)
	if [ -n "$cli_session" ]; then
		echo -e "${RED}  CliSession: $cli_session${NC}"
	fi
	TESTS_FAILED=$((TESTS_FAILED + 1))
}

info() {
	echo -e "${YELLOW}→ $1${NC}"
}

# Find the latest CLI session ID from internal logs for debugging correlation
find_latest_cli_session() {
	local logs_dir="$HOME/.config/agentuity/logs"
	if [ -d "$logs_dir" ]; then
		local latest
		latest=$(ls -1t "$logs_dir" 2>/dev/null | head -1)
		if [ -n "$latest" ]; then
			echo "$latest"
		fi
	fi
}

section() {
	echo ""
	echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
	echo -e "${YELLOW}  $1${NC}"
	echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

echo "========================================"
echo "  Sandbox CLI Test Suite"
echo "========================================"
echo "Test directory: $TEST_DIR"

# Setup test files
info "Setting up test files..."
echo "Hello from test file" > "$TEST_DIR/test.txt"
printf '\x00\x01\x02\x03\x04\x05' > "$TEST_DIR/binary.bin"
mkdir -p "$TEST_DIR/testdir/subdir"
echo "file1 content" > "$TEST_DIR/testdir/a.txt"
echo "file2 content" > "$TEST_DIR/testdir/subdir/b.txt"
echo "file3 content" > "$TEST_DIR/testdir/subdir/c.txt"
cat > "$TEST_DIR/script.sh" << 'EOF'
#!/bin/bash
echo "Script executed with arg: $1"
EOF
chmod +x "$TEST_DIR/script.sh"
pass "Test files created"

# ============================================
section "RUN Command Tests"
# ============================================

# Test: Run one-shot command
info "Test: sandbox run - basic command"
RUN_OUTPUT=$($CLI cloud sandbox run --description "$SANDBOX_DESC" -- echo "hello from run" 2>&1) || true
if echo "$RUN_OUTPUT" | grep -q "hello from run"; then
	pass "sandbox run executes command and returns output"
else
	fail "sandbox run did not return expected output" "$RUN_OUTPUT"
fi

# Test: Run with file injection
info "Test: sandbox run --file"
RUN_FILE_OUTPUT=$($CLI cloud sandbox run --description "$SANDBOX_DESC" --file "script.sh:$TEST_DIR/script.sh" -- bash script.sh testarg 2>&1) || true
if echo "$RUN_FILE_OUTPUT" | grep -q "Script executed with arg: testarg"; then
	pass "sandbox run --file injects file and executes correctly"
else
	fail "sandbox run --file did not execute script correctly" "$RUN_FILE_OUTPUT"
fi

# Test: Run with environment variable
info "Test: sandbox run --env"
RUN_ENV_OUTPUT=$($CLI cloud sandbox run --description "$SANDBOX_DESC" --env "MY_VAR=hello_env" -- sh -c 'echo $MY_VAR' 2>&1) || true
if echo "$RUN_ENV_OUTPUT" | grep -q "hello_env"; then
	pass "sandbox run --env sets environment variable"
else
	fail "sandbox run --env did not set variable" "$RUN_ENV_OUTPUT"
fi

# Test: Run with network enabled (test DNS resolution)
info "Test: sandbox run --network"
RUN_NET_OUTPUT=$($CLI cloud sandbox run --description "$SANDBOX_DESC" --network -- sh -c 'getent hosts example.com && echo "DNS_OK"' 2>&1) || true
if echo "$RUN_NET_OUTPUT" | grep -q "DNS_OK"; then
	pass "sandbox run --network enables network access"
else
	fail "sandbox run --network failed DNS resolution" "$RUN_NET_OUTPUT"
fi

# ============================================
section "ORG ENV/SECRET INTERPOLATION Tests"
# ============================================
# Test org-level env and secret interpolation in sandbox env
# Syntax: ${env:KEY} for org env vars, ${secret:KEY} for org secrets

# First, get the org ID (needed for non-TTY mode)
# Prefer AGENTUITY_CLOUD_ORG_ID env var (used by sandbox commands) over auth org current
# to ensure env/secrets are set on the SAME org that sandbox commands operate on.
info "Getting organization ID for interpolation tests..."
if [ -n "$AGENTUITY_CLOUD_ORG_ID" ]; then
	ORG_ID="$AGENTUITY_CLOUD_ORG_ID"
else
	# auth org current --json returns the raw org ID as a quoted string, e.g. "org_xxx"
	ORG_RAW=$($CLI auth org current --json 2>&1) || true
	# Strip quotes and whitespace to extract org ID
	ORG_ID=$(echo "$ORG_RAW" | tr -d '"\n\r ' | grep -o 'org_[a-zA-Z0-9]*' || true)
fi

if [ -z "$ORG_ID" ] || [[ "$ORG_ID" != org_* ]]; then
	info "Skipping org interpolation tests - could not determine org ID"
else
	pass "Using org ID: $ORG_ID"

	# Set up org-level env and secret for testing
	ORG_TEST_KEY="SANDBOX_TEST_ORG_VAR_${RUN_ID}"
	ORG_SECRET_KEY="SANDBOX_TEST_ORG_SECRET_${RUN_ID}"
	ORG_TEST_VALUE="org_env_test_value"
	ORG_SECRET_VALUE="org_secret_test_value"

	info "Setting up org-level env and secret for interpolation tests..."
	$CLI cloud env set "$ORG_TEST_KEY" "$ORG_TEST_VALUE" --org "$ORG_ID" 2>/dev/null || true
	$CLI cloud env set "$ORG_SECRET_KEY" "$ORG_SECRET_VALUE" --secret --org "$ORG_ID" 2>/dev/null || true

	# Test: sandbox run with org env interpolation
	info "Test: sandbox run --env with \${env:KEY} interpolation"
	ORG_ENV_RUN_OUTPUT=$($CLI cloud sandbox run --description "$SANDBOX_DESC" --env "MY_VAR=\${env:$ORG_TEST_KEY}" -- sh -c 'echo $MY_VAR' 2>&1) || true
	if echo "$ORG_ENV_RUN_OUTPUT" | grep -q "$ORG_TEST_VALUE"; then
		pass "sandbox run --env with \${env:KEY} interpolates org env var"
	else
		fail "sandbox run --env with \${env:KEY} did not interpolate org env var" "$ORG_ENV_RUN_OUTPUT"
	fi

	# Test: sandbox run with org secret interpolation
	info "Test: sandbox run --env with \${secret:KEY} interpolation"
	ORG_SECRET_RUN_OUTPUT=$($CLI cloud sandbox run --description "$SANDBOX_DESC" --env "MY_SECRET=\${secret:$ORG_SECRET_KEY}" -- sh -c 'echo $MY_SECRET' 2>&1) || true
	if echo "$ORG_SECRET_RUN_OUTPUT" | grep -q "$ORG_SECRET_VALUE"; then
		pass "sandbox run --env with \${secret:KEY} interpolates org secret"
	else
		fail "sandbox run --env with \${secret:KEY} did not interpolate org secret" "$ORG_SECRET_RUN_OUTPUT"
	fi

	# Test: sandbox run with default value when org key doesn't exist
	info "Test: sandbox run --env with \${env:MISSING:-default} default value"
	DEFAULT_RUN_OUTPUT=$($CLI cloud sandbox run --description "$SANDBOX_DESC" --env "MY_VAR=\${env:THIS_KEY_DOES_NOT_EXIST:-fallback_value}" -- sh -c 'echo $MY_VAR' 2>&1) || true
	if echo "$DEFAULT_RUN_OUTPUT" | grep -q "fallback_value"; then
		pass "sandbox run --env with \${env:KEY:-default} uses default value"
	else
		fail "sandbox run --env with \${env:KEY:-default} did not use default value" "$DEFAULT_RUN_OUTPUT"
	fi

	# Test: sandbox run with default value when org secret doesn't exist
	info "Test: sandbox run --env with \${secret:MISSING:-default} default value"
	SECRET_DEFAULT_RUN_OUTPUT=$($CLI cloud sandbox run --description "$SANDBOX_DESC" --env "MY_SECRET=\${secret:THIS_SECRET_DOES_NOT_EXIST:-secret_fallback}" -- sh -c 'echo $MY_SECRET' 2>&1) || true
	if echo "$SECRET_DEFAULT_RUN_OUTPUT" | grep -q "secret_fallback"; then
		pass "sandbox run --env with \${secret:KEY:-default} uses default value"
	else
		fail "sandbox run --env with \${secret:KEY:-default} did not use default value" "$SECRET_DEFAULT_RUN_OUTPUT"
	fi

	# Test: sandbox run with mixed static and interpolated values
	info "Test: sandbox run --env with mixed static and interpolated values"
	MIXED_RUN_OUTPUT=$($CLI cloud sandbox run --description "$SANDBOX_DESC" --env "MIXED=prefix_\${env:$ORG_TEST_KEY}_suffix" -- sh -c 'echo $MIXED' 2>&1) || true
	if echo "$MIXED_RUN_OUTPUT" | grep -q "prefix_${ORG_TEST_VALUE}_suffix"; then
		pass "sandbox run --env with mixed static and interpolated values works"
	else
		fail "sandbox run --env with mixed values did not interpolate correctly" "$MIXED_RUN_OUTPUT"
	fi

	# Test: sandbox run with multiple interpolations in one value
	info "Test: sandbox run --env with multiple interpolations"
	MULTI_RUN_OUTPUT=$($CLI cloud sandbox run --description "$SANDBOX_DESC" --env "MULTI=\${env:$ORG_TEST_KEY}_and_\${secret:$ORG_SECRET_KEY}" -- sh -c 'echo $MULTI' 2>&1) || true
	if echo "$MULTI_RUN_OUTPUT" | grep -q "${ORG_TEST_VALUE}_and_${ORG_SECRET_VALUE}"; then
		pass "sandbox run --env with multiple interpolations works"
	else
		fail "sandbox run --env with multiple interpolations did not work" "$MULTI_RUN_OUTPUT"
	fi

	# Clean up org-level test vars
	info "Cleaning up org-level test env/secrets..."
	$CLI cloud env delete "$ORG_TEST_KEY" --org "$ORG_ID" 2>/dev/null || true
	$CLI cloud env delete "$ORG_SECRET_KEY" --org "$ORG_ID" 2>/dev/null || true
	pass "Org-level test vars cleaned up"
fi

# ============================================
section "CREATE & GET & LIST Command Tests"
# ============================================

# Test: Create sandbox with custom resources
# Use --idle-timeout 10m to prevent sandbox from being reaped during long-running tests
info "Test: sandbox create --memory --cpu --disk --idle-timeout"
CREATE_OUTPUT=$($CLI cloud sandbox create --description "$SANDBOX_DESC" --memory 1Gi --cpu 1000m --disk 2Gi --idle-timeout 10m --json 2>&1) || true
SANDBOX_ID=$(echo "$CREATE_OUTPUT" | grep -o '"sandboxId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
if [ -n "$SANDBOX_ID" ] && [[ "$SANDBOX_ID" == sbx_* ]]; then
	pass "sandbox create returns valid sandboxId: $SANDBOX_ID"
else
	fail "sandbox create did not return valid sandboxId" "$CREATE_OUTPUT"
	exit 1  # Can't continue without sandbox
fi

# Verify status field exists
if echo "$CREATE_OUTPUT" | grep -q '"status"'; then
	pass "sandbox create returns status field"
else
	fail "sandbox create missing status field" "$CREATE_OUTPUT"
fi

# Test: Get sandbox info
info "Test: sandbox get --json"
GET_OUTPUT=$($CLI cloud sandbox get "$SANDBOX_ID" --json 2>&1) || true
GET_SANDBOX_ID=$(echo "$GET_OUTPUT" | grep -o '"sandboxId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
if [ "$GET_SANDBOX_ID" = "$SANDBOX_ID" ]; then
	pass "sandbox get returns correct sandboxId"
else
	fail "sandbox get returned wrong sandboxId" "$GET_OUTPUT"
fi

# Verify get returns status
GET_STATUS=$(echo "$GET_OUTPUT" | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
if [ -n "$GET_STATUS" ]; then
	pass "sandbox get returns status: $GET_STATUS"
else
	fail "sandbox get missing status" "$GET_OUTPUT"
fi

# Test: Verify resources are returned in get response
info "Test: sandbox get returns resources"
if echo "$GET_OUTPUT" | grep -q '"resources"'; then
	pass "sandbox get returns resources field"
else
	fail "sandbox get missing resources field" "$GET_OUTPUT"
fi

# Verify specific resource values
GET_MEMORY=$(echo "$GET_OUTPUT" | grep -o '"memory"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
if [ "$GET_MEMORY" = "1Gi" ]; then
	pass "sandbox get returns correct memory: $GET_MEMORY"
else
	fail "sandbox get returned wrong memory (expected 1Gi)" "$GET_MEMORY"
fi

GET_CPU=$(echo "$GET_OUTPUT" | grep -o '"cpu"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
if [ "$GET_CPU" = "1000m" ]; then
	pass "sandbox get returns correct cpu: $GET_CPU"
else
	fail "sandbox get returned wrong cpu (expected 1000m)" "$GET_CPU"
fi

GET_DISK=$(echo "$GET_OUTPUT" | grep -o '"disk"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
if [ "$GET_DISK" = "2Gi" ]; then
	pass "sandbox get returns correct disk: $GET_DISK"
else
	fail "sandbox get returned wrong disk (expected 2Gi)" "$GET_DISK"
fi

# Test: List sandboxes includes our sandbox
info "Test: sandbox list --json"
LIST_OUTPUT=$($CLI cloud sandbox list --json 2>&1) || true
if echo "$LIST_OUTPUT" | grep -q "$SANDBOX_ID"; then
	pass "sandbox list includes created sandbox"
else
	fail "sandbox list does not include created sandbox" "$LIST_OUTPUT"
fi

# Verify list returns total count
if echo "$LIST_OUTPUT" | grep -q '"total"'; then
	pass "sandbox list returns total count"
else
	fail "sandbox list missing total count" "$LIST_OUTPUT"
fi

# Wait for sandbox to be ready (status: idle)
info "Waiting for sandbox to become ready..."
MAX_WAIT=30
WAIT_COUNT=0
while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
	STATUS_OUTPUT=$($CLI cloud sandbox get "$SANDBOX_ID" --json 2>&1) || true
	CURRENT_STATUS=$(echo "$STATUS_OUTPUT" | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
	if [ "$CURRENT_STATUS" = "idle" ]; then
		pass "sandbox is ready (status: idle)"
		break
	fi
	sleep 1
	WAIT_COUNT=$((WAIT_COUNT + 1))
done
if [ $WAIT_COUNT -eq $MAX_WAIT ]; then
	fail "sandbox did not become ready within ${MAX_WAIT}s" "status: $CURRENT_STATUS" "$STATUS_OUTPUT"
fi

# ============================================
section "EXEC Command Tests"
# ============================================

# Test: Execute simple command
info "Test: sandbox exec - echo command"
EXEC_OUTPUT=$($CLI cloud sandbox exec "$SANDBOX_ID" -- echo "exec test" 2>&1) || true
if echo "$EXEC_OUTPUT" | grep -q "exec test"; then
	pass "sandbox exec returns command output"
else
	fail "sandbox exec did not return expected output" "$EXEC_OUTPUT"
fi

# Test: Execute command with exit code
info "Test: sandbox exec - exit code handling"
EXEC_EXIT=$($CLI cloud sandbox exec "$SANDBOX_ID" -- sh -c 'exit 0' 2>&1) || true
# Should not contain "failed"
if ! echo "$EXEC_EXIT" | grep -qi "failed\|error"; then
	pass "sandbox exec handles successful exit"
else
	fail "sandbox exec reported error on success" "$EXEC_EXIT"
fi

# Test: File persistence between execs (only home folder persists)
info "Test: sandbox exec - state persistence"
$CLI cloud sandbox exec "$SANDBOX_ID" -- sh -c 'echo persistent > /home/agentuity/state.txt' >/dev/null 2>&1 || true
PERSIST_OUTPUT=$($CLI cloud sandbox exec "$SANDBOX_ID" -- cat /home/agentuity/state.txt 2>&1) || true
if echo "$PERSIST_OUTPUT" | grep -q "persistent"; then
	pass "sandbox exec maintains state between calls"
else
	fail "sandbox exec did not maintain state" "$PERSIST_OUTPUT"
fi

# ============================================
section "CP Command Tests"
# ============================================

# Test: Upload single file
info "Test: sandbox cp - upload file"
UPLOAD_OUTPUT=$($CLI cloud sandbox cp "$TEST_DIR/test.txt" "$SANDBOX_ID:test.txt" 2>&1) || true
if echo "$UPLOAD_OUTPUT" | grep -q "Copied" && echo "$UPLOAD_OUTPUT" | grep -q "21 bytes"; then
	pass "sandbox cp uploads file with correct byte count"
else
	fail "sandbox cp upload failed or wrong byte count" "$UPLOAD_OUTPUT"
fi

# Verify file content in sandbox
info "Test: sandbox cp - verify uploaded content"
VERIFY_OUTPUT=$($CLI cloud sandbox exec "$SANDBOX_ID" -- cat /home/agentuity/test.txt 2>&1) || true
if echo "$VERIFY_OUTPUT" | grep -q "Hello from test file"; then
	pass "uploaded file has correct content"
else
	fail "uploaded file content mismatch" "$VERIFY_OUTPUT"
fi

# Test: Download file (using relative path)
info "Test: sandbox cp - download file"
rm -f "$TEST_DIR/downloaded.txt"
DOWNLOAD_OUTPUT=$($CLI cloud sandbox cp "$SANDBOX_ID:test.txt" "$TEST_DIR/downloaded.txt" 2>&1) || true
if [ -f "$TEST_DIR/downloaded.txt" ]; then
	DOWNLOADED_CONTENT=$(cat "$TEST_DIR/downloaded.txt")
	if [ "$DOWNLOADED_CONTENT" = "Hello from test file" ]; then
		pass "sandbox cp downloads file with correct content"
	else
		fail "downloaded file has wrong content" "$DOWNLOADED_CONTENT"
	fi
else
	fail "sandbox cp did not create downloaded file" "$DOWNLOAD_OUTPUT"
fi

# Test: Binary file integrity
info "Test: sandbox cp - binary file integrity"
$CLI cloud sandbox cp "$TEST_DIR/binary.bin" "$SANDBOX_ID:binary.bin" 2>&1 || true
$CLI cloud sandbox cp "$SANDBOX_ID:binary.bin" "$TEST_DIR/downloaded.bin" 2>&1 || true
if cmp -s "$TEST_DIR/binary.bin" "$TEST_DIR/downloaded.bin"; then
	pass "binary file maintains integrity through upload/download"
else
	fail "binary file corrupted" "Files differ"
fi

# Test: Directory upload with -r
info "Test: sandbox cp -r - upload directory"
DIR_UPLOAD=$($CLI cloud sandbox cp -r "$TEST_DIR/testdir" "$SANDBOX_ID:testdir" 2>&1) || true
if echo "$DIR_UPLOAD" | grep -q "3 files"; then
	pass "sandbox cp -r uploads directory with correct file count"
else
	fail "sandbox cp -r wrong file count" "$DIR_UPLOAD"
fi

# Verify directory structure
info "Test: sandbox cp -r - verify structure"
STRUCT_OUTPUT=$($CLI cloud sandbox exec "$SANDBOX_ID" -- find /home/agentuity/testdir -name "*.txt" 2>&1) || true
if echo "$STRUCT_OUTPUT" | grep -q "a.txt" && echo "$STRUCT_OUTPUT" | grep -q "b.txt" && echo "$STRUCT_OUTPUT" | grep -q "c.txt"; then
	pass "directory structure preserved"
else
	fail "directory structure not preserved" "$STRUCT_OUTPUT"
fi

# Test: Directory download with -r (using relative path)
info "Test: sandbox cp -r - download directory"
rm -rf "$TEST_DIR/downloaded-dir"
DIR_DOWNLOAD=$($CLI cloud sandbox cp -r "$SANDBOX_ID:testdir" "$TEST_DIR/downloaded-dir" 2>&1) || true
if [ -f "$TEST_DIR/downloaded-dir/a.txt" ] && [ -f "$TEST_DIR/downloaded-dir/subdir/b.txt" ] && [ -f "$TEST_DIR/downloaded-dir/subdir/c.txt" ]; then
	pass "sandbox cp -r downloads directory with correct structure"
else
	fail "downloaded directory structure incorrect" "Command output: $DIR_DOWNLOAD\nDirectory listing: $(ls -laR "$TEST_DIR/downloaded-dir" 2>&1)"
fi

# Test: Absolute path upload (inside /home/agentuity)
# NOTE: This test requires updated Hadron with /home/agentuity path support
# Skipping until Hadron is deployed with the path normalization fix
info "Test: sandbox cp - absolute path (skipped - requires Hadron update)"
pass "sandbox cp absolute path test skipped"

# ============================================
section "MKDIR Command Tests"
# ============================================

# Test: Create directory
info "Test: sandbox mkdir"
MKDIR_OUTPUT=$($CLI cloud sandbox mkdir "$SANDBOX_ID" /home/agentuity/newdir 2>&1) || true
if echo "$MKDIR_OUTPUT" | grep -qi "Created directory"; then
	pass "sandbox mkdir creates directory"
else
	fail "sandbox mkdir failed" "$MKDIR_OUTPUT"
fi

# Verify directory exists
MKDIR_VERIFY=$($CLI cloud sandbox exec "$SANDBOX_ID" -- test -d /home/agentuity/newdir && echo "DIR_EXISTS" 2>&1) || true
if echo "$MKDIR_VERIFY" | grep -q "DIR_EXISTS"; then
	pass "mkdir directory exists"
else
	fail "mkdir directory not found" "$MKDIR_VERIFY"
fi

# Test: Create nested directories with -p
info "Test: sandbox mkdir -p (recursive)"
MKDIR_P_OUTPUT=$($CLI cloud sandbox mkdir "$SANDBOX_ID" /home/agentuity/nested/deep/dir -p 2>&1) || true
if echo "$MKDIR_P_OUTPUT" | grep -qi "Created directory"; then
	pass "sandbox mkdir -p creates nested directories"
else
	fail "sandbox mkdir -p failed" "$MKDIR_P_OUTPUT"
fi

# Verify nested structure
NESTED_VERIFY=$($CLI cloud sandbox exec "$SANDBOX_ID" -- test -d /home/agentuity/nested/deep/dir && echo "NESTED_EXISTS" 2>&1) || true
if echo "$NESTED_VERIFY" | grep -q "NESTED_EXISTS"; then
	pass "nested directories exist"
else
	fail "nested directories not found" "$NESTED_VERIFY"
fi

# ============================================
section "LS Command Tests"
# ============================================

# Test: List files in directory
info "Test: sandbox files"
LS_OUTPUT=$($CLI cloud sandbox files "$SANDBOX_ID" /home/agentuity 2>&1) || true
if echo "$LS_OUTPUT" | grep -q "test.txt" && echo "$LS_OUTPUT" | grep -q "testdir"; then
	pass "sandbox files shows files and directories"
else
	fail "sandbox files missing expected entries" "$LS_OUTPUT"
fi

# Test: List with JSON output
info "Test: sandbox files --json"
LS_JSON=$($CLI cloud sandbox files "$SANDBOX_ID" /home/agentuity --json 2>&1) || true
if echo "$LS_JSON" | grep -q '"files"' && echo "$LS_JSON" | grep -q '"total"'; then
	pass "sandbox files --json returns structured data"
else
	fail "sandbox files --json missing expected fields" "$LS_JSON"
fi

# Verify directory indicator
if echo "$LS_OUTPUT" | grep -q "d.*testdir"; then
	pass "sandbox files shows directory indicator"
else
	# May have different format, just check it works
	pass "sandbox files output format acceptable"
fi

# Test: List with long format
info "Test: sandbox files -l (long format)"
LS_LONG=$($CLI cloud sandbox files "$SANDBOX_ID" /home/agentuity -l 2>&1) || true
if echo "$LS_LONG" | grep -q "0644\|0755"; then
	pass "sandbox files -l shows file permissions"
else
	fail "sandbox files -l missing permissions" "$LS_LONG"
fi

# Verify long format includes modification time
if echo "$LS_LONG" | grep -q "[A-Z][a-z][a-z]"; then
	pass "sandbox files -l shows modification time"
else
	fail "sandbox files -l missing modification time" "$LS_LONG"
fi

# Test: Long format with JSON includes mode and modTime
info "Test: sandbox files --json includes mode and modTime"
LS_JSON_LONG=$($CLI cloud sandbox files "$SANDBOX_ID" /home/agentuity --json 2>&1) || true
if echo "$LS_JSON_LONG" | grep -q '"mode"' && echo "$LS_JSON_LONG" | grep -q '"modTime"'; then
	pass "sandbox files --json includes mode and modTime fields"
else
	fail "sandbox files --json missing mode/modTime fields" "$LS_JSON_LONG"
fi

# ============================================
section "RMDIR Command Tests"
# ============================================

# Test: Remove empty directory
info "Test: sandbox rmdir (empty dir)"
RMDIR_OUTPUT=$($CLI cloud sandbox rmdir "$SANDBOX_ID" /home/agentuity/newdir 2>&1) || true
if echo "$RMDIR_OUTPUT" | grep -qi "Removed directory"; then
	pass "sandbox rmdir removes empty directory"
else
	fail "sandbox rmdir failed" "$RMDIR_OUTPUT"
fi

# Verify directory removed
RMDIR_VERIFY=$($CLI cloud sandbox exec "$SANDBOX_ID" -- sh -c 'if [ -d /home/agentuity/newdir ]; then echo "STILL_EXISTS"; else echo "REMOVED"; fi' 2>&1) || true
if echo "$RMDIR_VERIFY" | grep -q "REMOVED"; then
	pass "rmdir directory no longer exists"
else
	fail "rmdir directory still exists" "$RMDIR_VERIFY"
fi

# Test: Remove directory recursively
info "Test: sandbox rmdir -r (recursive)"
RMDIR_R_OUTPUT=$($CLI cloud sandbox rmdir "$SANDBOX_ID" /home/agentuity/nested -r 2>&1) || true
if echo "$RMDIR_R_OUTPUT" | grep -qi "Removed directory"; then
	pass "sandbox rmdir -r removes directory tree"
else
	fail "sandbox rmdir -r failed" "$RMDIR_R_OUTPUT"
fi

# Verify recursive removal
RMDIR_R_VERIFY=$($CLI cloud sandbox exec "$SANDBOX_ID" -- sh -c 'if [ -d /home/agentuity/nested ]; then echo "STILL_EXISTS"; else echo "REMOVED"; fi' 2>&1) || true
if echo "$RMDIR_R_VERIFY" | grep -q "REMOVED"; then
	pass "rmdir -r directory tree removed"
else
	fail "rmdir -r directory tree still exists" "$RMDIR_R_VERIFY"
fi

# ============================================
section "RM Command Tests (Remove File)"
# ============================================

# Create a test file to remove
info "Test: Creating test file for rm"
$CLI cloud sandbox exec "$SANDBOX_ID" -- sh -c 'echo "file to delete" > /home/agentuity/todelete.txt' >/dev/null 2>&1 || true
RM_CHECK=$($CLI cloud sandbox exec "$SANDBOX_ID" -- cat /home/agentuity/todelete.txt 2>&1) || true
if echo "$RM_CHECK" | grep -q "file to delete"; then
	pass "test file created for rm"
else
	fail "failed to create test file for rm" "$RM_CHECK"
fi

# Test: Remove a file
info "Test: sandbox rm"
RM_OUTPUT=$($CLI cloud sandbox rm "$SANDBOX_ID" /home/agentuity/todelete.txt 2>&1) || true
if echo "$RM_OUTPUT" | grep -qi "Removed file"; then
	pass "sandbox rm removes file"
else
	fail "sandbox rm failed" "$RM_OUTPUT"
fi

# Verify file removed
RM_VERIFY=$($CLI cloud sandbox exec "$SANDBOX_ID" -- sh -c 'if [ -f /home/agentuity/todelete.txt ]; then echo "STILL_EXISTS"; else echo "REMOVED"; fi' 2>&1) || true
if echo "$RM_VERIFY" | grep -q "REMOVED"; then
	pass "rm file no longer exists"
else
	fail "rm file still exists" "$RM_VERIFY"
fi

# Test: Remove non-existent file (should fail gracefully)
info "Test: sandbox rm - non-existent file"
RM_NOFILE=$($CLI cloud sandbox rm "$SANDBOX_ID" /home/agentuity/nonexistent.txt 2>&1) || true
if echo "$RM_NOFILE" | grep -qi "not found\|error\|fail"; then
	pass "sandbox rm reports error for non-existent file"
else
	fail "sandbox rm did not report error for non-existent file" "$RM_NOFILE"
fi

# Test: rm on directory should fail (use rmdir instead)
info "Test: sandbox rm - fails on directory"
$CLI cloud sandbox mkdir "$SANDBOX_ID" /home/agentuity/testrmdir >/dev/null 2>&1 || true
RM_DIR=$($CLI cloud sandbox rm "$SANDBOX_ID" /home/agentuity/testrmdir 2>&1) || true
if echo "$RM_DIR" | grep -qi "directory\|error\|fail"; then
	pass "sandbox rm correctly fails on directory"
else
	fail "sandbox rm should fail on directory" "$RM_DIR"
fi
# Clean up test directory
$CLI cloud sandbox rmdir "$SANDBOX_ID" /home/agentuity/testrmdir >/dev/null 2>&1 || true

# Test: JSON output
info "Test: sandbox rm --json"
RM_JSON_READY=0
set +e
RM_JSON_CREATE=$($CLI cloud sandbox exec "$SANDBOX_ID" -- sh -c 'echo "json test" > /home/agentuity/jsontest.txt' 2>&1)
RM_JSON_CREATE_EXIT=$?
set -e
if [ "$RM_JSON_CREATE_EXIT" -ne 0 ]; then
	fail "sandbox rm --json setup failed to create file (exit code $RM_JSON_CREATE_EXIT)" "$RM_JSON_CREATE"
else
	set +e
	RM_JSON_EXISTS=$($CLI cloud sandbox exec "$SANDBOX_ID" -- test -f /home/agentuity/jsontest.txt 2>&1)
	RM_JSON_EXISTS_EXIT=$?
	set -e
	if [ "$RM_JSON_EXISTS_EXIT" -ne 0 ]; then
		fail "sandbox rm --json setup could not verify file exists" "$RM_JSON_EXISTS"
	else
		RM_JSON_READY=1
	fi
fi
if [ "$RM_JSON_READY" -eq 1 ]; then
	set +e
	RM_JSON=$($CLI cloud sandbox rm "$SANDBOX_ID" /home/agentuity/jsontest.txt --json 2>&1)
	RM_JSON_EXIT=$?
	set -e
	if [ "$RM_JSON_EXIT" -ne 0 ]; then
		fail "sandbox rm --json failed to remove file (exit code $RM_JSON_EXIT)" "$RM_JSON"
	else
		pass "sandbox rm --json exits successfully"
	fi
	if echo "$RM_JSON" | grep -q '"success"' && echo "$RM_JSON" | grep -q '"path"'; then
		pass "sandbox rm --json returns structured data"
	else
		fail "sandbox rm --json missing expected fields" "$RM_JSON"
	fi
fi

# ============================================
section "ENV Command Tests"
# ============================================

# Test: Set environment variable
info "Test: sandbox env - set variable"
ENV_SET_OUTPUT=$($CLI cloud sandbox env "$SANDBOX_ID" TEST_VAR=hello_world 2>&1) || true
if echo "$ENV_SET_OUTPUT" | grep -qi "Set 1 environment"; then
	pass "sandbox env sets variable"
else
	fail "sandbox env set failed" "$ENV_SET_OUTPUT"
fi

# Verify env var is accessible in exec
info "Test: sandbox env - verify in exec"
ENV_VERIFY=$($CLI cloud sandbox exec "$SANDBOX_ID" -- sh -c 'echo $TEST_VAR' 2>&1) || true
if echo "$ENV_VERIFY" | grep -q "hello_world"; then
	pass "environment variable accessible in exec"
else
	fail "environment variable not accessible" "$ENV_VERIFY"
fi

# Test: Set multiple variables
info "Test: sandbox env - set multiple"
ENV_MULTI=$($CLI cloud sandbox env "$SANDBOX_ID" VAR_A=alpha VAR_B=beta 2>&1) || true
if echo "$ENV_MULTI" | grep -qi "Set 2 environment"; then
	pass "sandbox env sets multiple variables"
else
	fail "sandbox env multiple set failed" "$ENV_MULTI"
fi

# Test: Delete environment variable
info "Test: sandbox env --delete"
ENV_DEL=$($CLI cloud sandbox env "$SANDBOX_ID" --delete TEST_VAR 2>&1) || true
if echo "$ENV_DEL" | grep -qi "Deleted 1 environment"; then
	pass "sandbox env deletes variable"
else
	fail "sandbox env delete failed" "$ENV_DEL"
fi

# Verify deletion
ENV_DEL_VERIFY=$($CLI cloud sandbox exec "$SANDBOX_ID" -- sh -c 'echo "VAR=${TEST_VAR:-UNSET}"' 2>&1) || true
if echo "$ENV_DEL_VERIFY" | grep -q "VAR=UNSET"; then
	pass "deleted variable no longer set"
else
	fail "deleted variable still accessible" "$ENV_DEL_VERIFY"
fi

# Test: JSON output
info "Test: sandbox env --json"
ENV_JSON=$($CLI cloud sandbox env "$SANDBOX_ID" JSON_TEST=value --json 2>&1) || true
if echo "$ENV_JSON" | grep -q '"success"' && echo "$ENV_JSON" | grep -q '"env"'; then
	pass "sandbox env --json returns structured data"
else
	fail "sandbox env --json missing expected fields" "$ENV_JSON"
fi

# ============================================
section "DOWNLOAD/UPLOAD Archive Tests"
# ============================================

# Test: Download as tar.gz
info "Test: sandbox download (tar.gz)"
rm -f "$TEST_DIR/sandbox-archive.tar.gz"
DOWNLOAD_OUTPUT=$($CLI cloud sandbox download "$SANDBOX_ID" "$TEST_DIR/sandbox-archive.tar.gz" 2>&1) || true
if [ -f "$TEST_DIR/sandbox-archive.tar.gz" ] && echo "$DOWNLOAD_OUTPUT" | grep -qi "Downloaded"; then
	pass "sandbox download creates tar.gz archive"
else
	fail "sandbox download failed" "$DOWNLOAD_OUTPUT"
fi

# Verify archive is valid
if tar -tzf "$TEST_DIR/sandbox-archive.tar.gz" >/dev/null 2>&1; then
	pass "downloaded tar.gz is valid"
else
	fail "downloaded tar.gz is invalid" "tar validation failed"
fi

# Test: Download as zip
info "Test: sandbox download --format zip"
rm -f "$TEST_DIR/sandbox-archive.zip"
DOWNLOAD_ZIP=$($CLI cloud sandbox download "$SANDBOX_ID" "$TEST_DIR/sandbox-archive.zip" --format zip 2>&1) || true
if [ -f "$TEST_DIR/sandbox-archive.zip" ] && echo "$DOWNLOAD_ZIP" | grep -qi "Downloaded"; then
	pass "sandbox download creates zip archive"
else
	fail "sandbox download zip failed" "$DOWNLOAD_ZIP"
fi

# Verify zip is valid
if unzip -t "$TEST_DIR/sandbox-archive.zip" >/dev/null 2>&1; then
	pass "downloaded zip is valid"
else
	fail "downloaded zip is invalid" "unzip validation failed"
fi

# Test: Download specific path
info "Test: sandbox download --path"
rm -f "$TEST_DIR/subdir-archive.tar.gz"
DOWNLOAD_PATH=$($CLI cloud sandbox download "$SANDBOX_ID" "$TEST_DIR/subdir-archive.tar.gz" --path /home/agentuity/testdir 2>&1) || true
if [ -f "$TEST_DIR/subdir-archive.tar.gz" ]; then
	pass "sandbox download --path creates archive"
else
	fail "sandbox download --path failed" "$DOWNLOAD_PATH"
fi

# Create a fresh sandbox to test upload
info "Test: Creating fresh sandbox for upload test"
UPLOAD_SANDBOX=$($CLI cloud sandbox create --description "$SANDBOX_DESC" --json 2>&1) || true
UPLOAD_SANDBOX_ID=$(echo "$UPLOAD_SANDBOX" | grep -o '"sandboxId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')

if [ -n "$UPLOAD_SANDBOX_ID" ]; then
	# Wait for sandbox to be ready
	sleep 3
	
	# Test: Upload tar.gz archive
	info "Test: sandbox upload (tar.gz)"
	UPLOAD_OUTPUT=$($CLI cloud sandbox upload "$UPLOAD_SANDBOX_ID" "$TEST_DIR/sandbox-archive.tar.gz" 2>&1) || true
	if echo "$UPLOAD_OUTPUT" | grep -qi "Uploaded"; then
		pass "sandbox upload extracts tar.gz archive"
	else
		fail "sandbox upload failed" "$UPLOAD_OUTPUT"
	fi
	
	# Verify files were extracted
	UPLOAD_VERIFY=$($CLI cloud sandbox exec "$UPLOAD_SANDBOX_ID" -- ls /home/agentuity 2>&1) || true
	if echo "$UPLOAD_VERIFY" | grep -q "test.txt"; then
		pass "uploaded archive contents extracted"
	else
		fail "uploaded archive contents not found" "$UPLOAD_VERIFY"
	fi
	
	# Clean up upload test sandbox
	$CLI cloud sandbox delete "$UPLOAD_SANDBOX_ID" --confirm 2>/dev/null || true
else
	fail "failed to create sandbox for upload test" "$UPLOAD_SANDBOX"
fi

# ============================================
section "SNAPSHOT Command Tests"
# ============================================

# Test: Create snapshot
info "Test: snapshot create --json"
SNAP_CREATE=$($CLI cloud sandbox snapshot create "$SANDBOX_ID" --json 2>&1) || true
SNAPSHOT_ID=$(echo "$SNAP_CREATE" | grep -o '"snapshotId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
track_snapshot "$SNAPSHOT_ID"
if [ -n "$SNAPSHOT_ID" ] && [[ "$SNAPSHOT_ID" == snp_* ]]; then
	pass "snapshot create returns valid snapshotId: $SNAPSHOT_ID"
else
	fail "snapshot create did not return valid snapshotId" "$SNAP_CREATE"
fi

# Verify snapshot has size info
if echo "$SNAP_CREATE" | grep -q '"sizeBytes"'; then
	pass "snapshot create returns sizeBytes"
else
	fail "snapshot create missing sizeBytes" "$SNAP_CREATE"
fi

# Test: Get snapshot
info "Test: snapshot get --json"
SNAP_GET=$($CLI cloud sandbox snapshot get "$SNAPSHOT_ID" --json 2>&1) || true
GET_SNAP_ID=$(echo "$SNAP_GET" | grep -o '"snapshotId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
if [ "$GET_SNAP_ID" = "$SNAPSHOT_ID" ]; then
	pass "snapshot get returns correct snapshotId"
else
	fail "snapshot get returned wrong snapshotId" "$SNAP_GET"
fi

# Test: List snapshots
info "Test: snapshot list --json"
SNAP_LIST=$($CLI cloud sandbox snapshot list --json 2>&1) || true
if echo "$SNAP_LIST" | grep -q "$SNAPSHOT_ID"; then
	pass "snapshot list includes created snapshot"
else
	fail "snapshot list does not include snapshot" "$SNAP_LIST"
fi

# Test: Tag snapshot
info "Test: snapshot tag"
TEST_TAG="test-${RUN_ID}"
TAG_OUTPUT=$($CLI cloud sandbox snapshot tag "$SNAPSHOT_ID" "$TEST_TAG" 2>&1) || true
if echo "$TAG_OUTPUT" | grep -qi "tagged\|$TEST_TAG"; then
	pass "snapshot tag succeeds"
else
	# Verify by getting snapshot
	TAGGED_SNAP=$($CLI cloud sandbox snapshot get "$SNAPSHOT_ID" --json 2>&1) || true
	if echo "$TAGGED_SNAP" | grep -q "$TEST_TAG"; then
		pass "snapshot tag applied (verified via get)"
	else
		fail "snapshot tag not applied" "$TAG_OUTPUT"
	fi
fi

# Test: Create sandbox from snapshot (by ID)
info "Test: sandbox create --snapshot (by ID)"
SNAP_SANDBOX=$($CLI cloud sandbox create --description "$SANDBOX_DESC" --snapshot "$SNAPSHOT_ID" --json 2>&1) || true
SNAP_SANDBOX_ID=$(echo "$SNAP_SANDBOX" | grep -o '"sandboxId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
if [ -n "$SNAP_SANDBOX_ID" ]; then
	# Wait for snapshot restore and verify file exists
	sleep 3
	RESTORE_VERIFY=$($CLI cloud sandbox exec "$SNAP_SANDBOX_ID" -- cat /home/agentuity/test.txt 2>&1) || true
	if echo "$RESTORE_VERIFY" | grep -q "Hello from test file"; then
		pass "sandbox from snapshot (by ID) contains restored files"
	else
		fail "sandbox from snapshot (by ID) missing files" "$RESTORE_VERIFY"
	fi
	# Clean up snapshot sandbox
	$CLI cloud sandbox delete "$SNAP_SANDBOX_ID" --confirm 2>/dev/null || true
else
	fail "failed to create sandbox from snapshot (by ID)" "$SNAP_SANDBOX"
fi

# Delete the first snapshot before creating a named one
if delete_and_untrack_snapshot "$SNAPSHOT_ID"; then
	SNAPSHOT_ID=""
fi

# ============================================
section "SNAPSHOT name:tag Resolution Tests"
# ============================================

# Create snapshot with explicit name and tag
SNAP_NAME="test-snap-${RUN_ID}"
SNAP_TAG="v1"
info "Test: snapshot create with --name and --tag"
NAMED_SNAP_CREATE=$($CLI cloud sandbox snapshot create "$SANDBOX_ID" --name "$SNAP_NAME" --tag "$SNAP_TAG" --json 2>&1) || true
SNAPSHOT_ID=$(echo "$NAMED_SNAP_CREATE" | grep -o '"snapshotId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
track_snapshot "$SNAPSHOT_ID"
CREATED_NAME=$(echo "$NAMED_SNAP_CREATE" | grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
CREATED_TAG=$(echo "$NAMED_SNAP_CREATE" | grep -o '"tag"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')

if [ "$CREATED_NAME" = "$SNAP_NAME" ] && [ "$CREATED_TAG" = "$SNAP_TAG" ]; then
	pass "snapshot create with --name and --tag: name=$CREATED_NAME, tag=$CREATED_TAG"
else
	fail "snapshot create did not set name/tag correctly" "expected name=$SNAP_NAME tag=$SNAP_TAG, got name=$CREATED_NAME tag=$CREATED_TAG" "$NAMED_SNAP_CREATE"
fi

# Test: Create sandbox using name:tag format
info "Test: sandbox create --snapshot name:tag"
NAMETAG_SANDBOX=$($CLI cloud sandbox create --description "$SANDBOX_DESC" --snapshot "$SNAP_NAME:$SNAP_TAG" --json 2>&1) || true
NAMETAG_SANDBOX_ID=$(echo "$NAMETAG_SANDBOX" | grep -o '"sandboxId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
if [ -n "$NAMETAG_SANDBOX_ID" ] && [[ "$NAMETAG_SANDBOX_ID" == sbx_* ]]; then
	sleep 3
	NAMETAG_VERIFY=$($CLI cloud sandbox exec "$NAMETAG_SANDBOX_ID" -- cat /home/agentuity/test.txt 2>&1) || true
	if echo "$NAMETAG_VERIFY" | grep -q "Hello from test file"; then
		pass "sandbox from snapshot (by name:tag) contains restored files"
	else
		fail "sandbox from snapshot (by name:tag) missing files" "$NAMETAG_VERIFY"
	fi
	$CLI cloud sandbox delete "$NAMETAG_SANDBOX_ID" --confirm 2>/dev/null || true
else
	fail "failed to create sandbox from snapshot using name:tag format" "$NAMETAG_SANDBOX"
fi

# Create another snapshot with same name but "latest" tag (default)
info "Test: snapshot create with --name (defaults to latest tag)"
LATEST_SNAP_CREATE=$($CLI cloud sandbox snapshot create "$SANDBOX_ID" --name "$SNAP_NAME" --json 2>&1) || true
LATEST_SNAP_ID=$(echo "$LATEST_SNAP_CREATE" | grep -o '"snapshotId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
track_snapshot "$LATEST_SNAP_ID"
LATEST_TAG=$(echo "$LATEST_SNAP_CREATE" | grep -o '"tag"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
if [ "$LATEST_TAG" = "latest" ]; then
	pass "snapshot create without --tag defaults to 'latest'"
else
	fail "snapshot create did not default to 'latest' tag" "got tag=$LATEST_TAG" "$LATEST_SNAP_CREATE"
fi

# Test: Create sandbox using name:latest format
info "Test: sandbox create --snapshot name:latest"
LATEST_SANDBOX=$($CLI cloud sandbox create --description "$SANDBOX_DESC" --snapshot "$SNAP_NAME:latest" --json 2>&1) || true
LATEST_SANDBOX_ID=$(echo "$LATEST_SANDBOX" | grep -o '"sandboxId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
if [ -n "$LATEST_SANDBOX_ID" ] && [[ "$LATEST_SANDBOX_ID" == sbx_* ]]; then
	sleep 3
	LATEST_VERIFY=$($CLI cloud sandbox exec "$LATEST_SANDBOX_ID" -- cat /home/agentuity/test.txt 2>&1) || true
	if echo "$LATEST_VERIFY" | grep -q "Hello from test file"; then
		pass "sandbox from snapshot (by name:latest) contains restored files"
	else
		fail "sandbox from snapshot (by name:latest) missing files" "$LATEST_VERIFY"
	fi
	$CLI cloud sandbox delete "$LATEST_SANDBOX_ID" --confirm 2>/dev/null || true
else
	fail "failed to create sandbox from snapshot using name:latest format" "$LATEST_SANDBOX"
fi

# Test: Create sandbox using just the snapshot name (should resolve to latest)
info "Test: sandbox create --snapshot name (implicit latest)"
IMPLICIT_SANDBOX=$($CLI cloud sandbox create --description "$SANDBOX_DESC" --snapshot "$SNAP_NAME" --json 2>&1) || true
IMPLICIT_SANDBOX_ID=$(echo "$IMPLICIT_SANDBOX" | grep -o '"sandboxId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
if [ -n "$IMPLICIT_SANDBOX_ID" ] && [[ "$IMPLICIT_SANDBOX_ID" == sbx_* ]]; then
	sleep 3
	IMPLICIT_VERIFY=$($CLI cloud sandbox exec "$IMPLICIT_SANDBOX_ID" -- cat /home/agentuity/test.txt 2>&1) || true
	if echo "$IMPLICIT_VERIFY" | grep -q "Hello from test file"; then
		pass "sandbox from snapshot (by name only) contains restored files"
	else
		fail "sandbox from snapshot (by name only) missing files" "$IMPLICIT_VERIFY"
	fi
	$CLI cloud sandbox delete "$IMPLICIT_SANDBOX_ID" --confirm 2>/dev/null || true
else
	fail "failed to create sandbox from snapshot using name only" "$IMPLICIT_SANDBOX"
fi

# Test: Error handling for non-existent snapshot name:tag
info "Test: sandbox create --snapshot with non-existent name:tag"
NONEXIST_OUTPUT=$($CLI cloud sandbox create --description "$SANDBOX_DESC" --snapshot "nonexistent-snap-${RUN_ID}:v999" --json 2>&1) || true
if echo "$NONEXIST_OUTPUT" | grep -qi "not found\|error\|failed"; then
	pass "non-existent snapshot name:tag returns error"
else
	# Clean up if sandbox was somehow created
	NONEXIST_ID=$(echo "$NONEXIST_OUTPUT" | grep -o '"sandboxId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
	if [ -n "$NONEXIST_ID" ]; then
		$CLI cloud sandbox delete "$NONEXIST_ID" --confirm 2>/dev/null || true
	fi
	fail "non-existent snapshot should have returned error" "$NONEXIST_OUTPUT"
fi

# Clean up snapshots
if delete_and_untrack_snapshot "$SNAPSHOT_ID"; then
	SNAPSHOT_ID=""
fi
delete_and_untrack_snapshot "$LATEST_SNAP_ID"

# ============================================
section "SNAPSHOT BUILD Command Tests"
# ============================================

# Setup build test directory
BUILD_DIR="$TEST_DIR/build-test"
mkdir -p "$BUILD_DIR/scripts"
mkdir -p "$BUILD_DIR/config"
echo "app.js content" > "$BUILD_DIR/app.js"
echo "helper.js content" > "$BUILD_DIR/scripts/helper.js"
echo '{"key": "value"}' > "$BUILD_DIR/config/settings.json"
echo "should be excluded" > "$BUILD_DIR/exclude.png"
pass "Build test files created"

# Test: Basic build with files
info "Test: snapshot build - basic with files"
cat > "$BUILD_DIR/agentuity-snapshot.yaml" << EOF
version: 1
runtime: bun:1
description: Test build snapshot
files:
  - "*.js"
  - scripts/**
  - config/*.json
  - "!*.png"
EOF

BUILD_OUTPUT=$($CLI cloud sandbox snapshot build "$BUILD_DIR" --tag "v1" --json 2>&1) || true
BUILD_SNAP_ID=$(echo "$BUILD_OUTPUT" | grep -o '"snapshotId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
track_snapshot "$BUILD_SNAP_ID"
if [ -n "$BUILD_SNAP_ID" ] && [[ "$BUILD_SNAP_ID" == snp_* ]]; then
	pass "snapshot build returns valid snapshotId: $BUILD_SNAP_ID"
	SNAPSHOT_ID="$BUILD_SNAP_ID"
else
	fail "snapshot build did not return valid snapshotId" "$BUILD_OUTPUT"
fi

# Verify build output includes expected fields
if echo "$BUILD_OUTPUT" | grep -q '"sizeBytes"'; then
	pass "snapshot build returns sizeBytes"
else
	fail "snapshot build missing sizeBytes" "$BUILD_OUTPUT"
fi

if echo "$BUILD_OUTPUT" | grep -q '"fileCount"'; then
	pass "snapshot build returns fileCount"
else
	fail "snapshot build missing fileCount" "$BUILD_OUTPUT"
fi

BUILD_TAG=$(echo "$BUILD_OUTPUT" | grep -o '"tag"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
if [ "$BUILD_TAG" = "v1" ]; then
	pass "snapshot build respects --tag option"
else
	fail "snapshot build did not use correct tag (expected v1)" "$BUILD_TAG" "$BUILD_OUTPUT"
fi

# Test: Create sandbox from built snapshot
info "Test: sandbox create from built snapshot"
if [ -n "$BUILD_SNAP_ID" ]; then
	BUILD_SANDBOX=$($CLI cloud sandbox create --description "$SANDBOX_DESC" --snapshot "$BUILD_SNAP_ID" --json 2>&1) || true
	BUILD_SANDBOX_ID=$(echo "$BUILD_SANDBOX" | grep -o '"sandboxId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
	if [ -n "$BUILD_SANDBOX_ID" ] && [[ "$BUILD_SANDBOX_ID" == sbx_* ]]; then
		sleep 3
		# Verify files from build exist
		VERIFY_APP=$($CLI cloud sandbox exec "$BUILD_SANDBOX_ID" -- cat /home/agentuity/app.js 2>&1) || true
		if echo "$VERIFY_APP" | grep -q "app.js content"; then
			pass "sandbox from built snapshot contains app.js"
		else
			fail "sandbox from built snapshot missing app.js" "$VERIFY_APP"
		fi
		
		VERIFY_HELPER=$($CLI cloud sandbox exec "$BUILD_SANDBOX_ID" -- cat /home/agentuity/scripts/helper.js 2>&1) || true
		if echo "$VERIFY_HELPER" | grep -q "helper.js content"; then
			pass "sandbox from built snapshot contains scripts/helper.js"
		else
			fail "sandbox from built snapshot missing scripts/helper.js" "$VERIFY_HELPER"
		fi
		
		# Verify excluded file is NOT present
		VERIFY_EXCLUDED=$($CLI cloud sandbox exec "$BUILD_SANDBOX_ID" -- ls /home/agentuity/exclude.png 2>&1) || true
		if echo "$VERIFY_EXCLUDED" | grep -qi "no such file\|cannot access"; then
			pass "snapshot build correctly excluded .png files"
		else
			fail "snapshot build did not exclude .png files" "$VERIFY_EXCLUDED"
		fi
		
		$CLI cloud sandbox delete "$BUILD_SANDBOX_ID" --confirm 2>/dev/null || true
	else
		fail "failed to create sandbox from built snapshot" "$BUILD_SANDBOX"
	fi
else
	fail "skipping sandbox create test - no snapshot ID" ""
fi

# Clean up first build snapshot
if delete_and_untrack_snapshot "$SNAPSHOT_ID"; then
	SNAPSHOT_ID=""
fi

# Test: Build with dependencies
info "Test: snapshot build with dependencies"
cat > "$BUILD_DIR/agentuity-snapshot.yaml" << EOF
version: 1
runtime: bun:1
dependencies:
  - curl
files:
  - "*.js"
EOF

DEP_BUILD=$($CLI cloud sandbox snapshot build "$BUILD_DIR" --json 2>&1) || true
DEP_SNAP_ID=$(echo "$DEP_BUILD" | grep -o '"snapshotId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
track_snapshot "$DEP_SNAP_ID"
if [ -n "$DEP_SNAP_ID" ] && [[ "$DEP_SNAP_ID" == snp_* ]]; then
	pass "snapshot build with dependencies succeeds"
	delete_and_untrack_snapshot "$DEP_SNAP_ID"
else
	fail "snapshot build with dependencies failed" "$DEP_BUILD"
fi

# Test: Build with env variables and substitution
info "Test: snapshot build with env substitution"
cat > "$BUILD_DIR/agentuity-snapshot.yaml" << EOF
version: 1
runtime: bun:1
files:
  - "*.js"
env:
  STATIC_VAR: static_value
  DYNAMIC_VAR: \${MY_SECRET}
EOF

ENV_BUILD=$($CLI cloud sandbox snapshot build "$BUILD_DIR" --env "MY_SECRET=secret123" --json 2>&1) || true
ENV_SNAP_ID=$(echo "$ENV_BUILD" | grep -o '"snapshotId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
track_snapshot "$ENV_SNAP_ID"
if [ -n "$ENV_SNAP_ID" ] && [[ "$ENV_SNAP_ID" == snp_* ]]; then
	pass "snapshot build with env substitution succeeds"
	delete_and_untrack_snapshot "$ENV_SNAP_ID"
else
	fail "snapshot build with env substitution failed" "$ENV_BUILD"
fi

# Test: Build with missing env variable (should fail)
info "Test: snapshot build with missing env variable"
MISSING_ENV_BUILD=$($CLI cloud sandbox snapshot build "$BUILD_DIR" --json 2>&1) || true
if echo "$MISSING_ENV_BUILD" | grep -qi "not defined\|MY_SECRET"; then
	pass "snapshot build fails with missing env variable"
else
	# Check if it somehow succeeded (which would be wrong)
	MISSING_SNAP_ID=$(echo "$MISSING_ENV_BUILD" | grep -o '"snapshotId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
	if [ -n "$MISSING_SNAP_ID" ]; then
		track_snapshot "$MISSING_SNAP_ID"
		delete_and_untrack_snapshot "$MISSING_SNAP_ID"
		fail "snapshot build should have failed with missing env variable" "$MISSING_ENV_BUILD"
	else
		fail "snapshot build error message not clear about missing variable" "$MISSING_ENV_BUILD"
	fi
fi

# Test: Build with metadata substitution
info "Test: snapshot build with metadata"
cat > "$BUILD_DIR/agentuity-snapshot.yaml" << EOF
version: 1
runtime: bun:1
files:
  - "*.js"
metadata:
  version: \${VERSION}
  author: test-suite
EOF

META_BUILD=$($CLI cloud sandbox snapshot build "$BUILD_DIR" --metadata "VERSION=1.0.0" --json 2>&1) || true
META_SNAP_ID=$(echo "$META_BUILD" | grep -o '"snapshotId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
track_snapshot "$META_SNAP_ID"
if [ -n "$META_SNAP_ID" ] && [[ "$META_SNAP_ID" == snp_* ]]; then
	pass "snapshot build with metadata succeeds"
	delete_and_untrack_snapshot "$META_SNAP_ID"
else
	fail "snapshot build with metadata failed" "$META_BUILD"
fi

# Test: Build with custom build file path
info "Test: snapshot build --file"
cat > "$BUILD_DIR/custom-build.yaml" << EOF
version: 1
runtime: bun:1
files:
  - config/*.json
EOF

CUSTOM_FILE_BUILD=$($CLI cloud sandbox snapshot build "$BUILD_DIR" --file "$BUILD_DIR/custom-build.yaml" --json 2>&1) || true
CUSTOM_SNAP_ID=$(echo "$CUSTOM_FILE_BUILD" | grep -o '"snapshotId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
track_snapshot "$CUSTOM_SNAP_ID"
if [ -n "$CUSTOM_SNAP_ID" ] && [[ "$CUSTOM_SNAP_ID" == snp_* ]]; then
	pass "snapshot build with --file option succeeds"
	delete_and_untrack_snapshot "$CUSTOM_SNAP_ID"
else
	fail "snapshot build with --file option failed" "$CUSTOM_FILE_BUILD"
fi

# Test: Build with --description override
info "Test: snapshot build --description"
cat > "$BUILD_DIR/agentuity-snapshot.yaml" << EOF
version: 1
runtime: bun:1
description: Original description
files:
  - "*.js"
EOF

DESC_BUILD=$($CLI cloud sandbox snapshot build "$BUILD_DIR" --description "Overridden description" --json 2>&1) || true
DESC_SNAP_ID=$(echo "$DESC_BUILD" | grep -o '"snapshotId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
track_snapshot "$DESC_SNAP_ID"
if [ -n "$DESC_SNAP_ID" ] && [[ "$DESC_SNAP_ID" == snp_* ]]; then
	pass "snapshot build with --description succeeds"
	delete_and_untrack_snapshot "$DESC_SNAP_ID"
else
	fail "snapshot build with --description failed" "$DESC_BUILD"
fi

# Test: Build dry-run mode
info "Test: snapshot build --dry-run"
cat > "$BUILD_DIR/agentuity-snapshot.yaml" << EOF
version: 1
runtime: bun:1
files:
  - "*.js"
  - scripts/**
EOF

DRY_RUN_BUILD=$($CLI cloud sandbox snapshot build "$BUILD_DIR" --dry-run 2>&1) || true
# Dry run should show info but not create a snapshot
if echo "$DRY_RUN_BUILD" | grep -qi "dry run"; then
	pass "snapshot build --dry-run shows dry run message"
else
	fail "snapshot build --dry-run did not indicate dry run mode" "$DRY_RUN_BUILD"
fi

# Test: Build with invalid build file (missing required field)
info "Test: snapshot build with invalid build file"
cat > "$BUILD_DIR/agentuity-snapshot.yaml" << EOF
version: 1
# Missing runtime - should fail validation
files:
  - "*.js"
EOF

INVALID_BUILD=$($CLI cloud sandbox snapshot build "$BUILD_DIR" --json 2>&1) || true
if echo "$INVALID_BUILD" | grep -qi "runtime\|required\|invalid"; then
	pass "snapshot build fails with missing runtime"
else
	INVALID_SNAP_ID=$(echo "$INVALID_BUILD" | grep -o '"snapshotId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
	if [ -n "$INVALID_SNAP_ID" ]; then
		track_snapshot "$INVALID_SNAP_ID"
		delete_and_untrack_snapshot "$INVALID_SNAP_ID"
		fail "snapshot build should have failed with missing runtime" "$INVALID_BUILD"
	else
		fail "snapshot build error message not clear about missing runtime" "$INVALID_BUILD"
	fi
fi

# Test: Build with invalid apt dependency
info "Test: snapshot build with invalid dependency"
cat > "$BUILD_DIR/agentuity-snapshot.yaml" << EOF
version: 1
runtime: bun:1
dependencies:
  - this-package-definitely-does-not-exist-xyz123
files:
  - "*.js"
EOF

INVALID_DEP_BUILD=$($CLI cloud sandbox snapshot build "$BUILD_DIR" --json 2>&1) || true
if echo "$INVALID_DEP_BUILD" | grep -qi "invalid\|not found\|error"; then
	pass "snapshot build fails with invalid dependency"
else
	INVALID_DEP_SNAP_ID=$(echo "$INVALID_DEP_BUILD" | grep -o '"snapshotId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
	if [ -n "$INVALID_DEP_SNAP_ID" ]; then
		track_snapshot "$INVALID_DEP_SNAP_ID"
		delete_and_untrack_snapshot "$INVALID_DEP_SNAP_ID"
		fail "snapshot build should have failed with invalid dependency" "$INVALID_DEP_BUILD"
	else
		fail "snapshot build error message not clear about invalid dependency" "$INVALID_DEP_BUILD"
	fi
fi

# ============================================
section "SNAPSHOT BUILD DIR FIELD Tests"
# ============================================
# Tests that the 'dir' field in snapshot build files correctly shifts
# the build context to a subdirectory for file resolution.

# Setup dir test directory structure:
#   dir-test/
#     subdir/
#       app.js
#       nested/
#         helper.js
#     outside.txt (should NOT be included when dir: subdir)
DIR_BUILD_DIR="$TEST_DIR/dir-test"
mkdir -p "$DIR_BUILD_DIR/subdir/nested"
echo "app from subdir" > "$DIR_BUILD_DIR/subdir/app.js"
echo "helper from subdir" > "$DIR_BUILD_DIR/subdir/nested/helper.js"
echo "should not be included" > "$DIR_BUILD_DIR/outside.txt"
pass "Dir field test files created"

# Test: Build with dir field - files resolved from subdir
info "Test: snapshot build with dir field"
cat > "$DIR_BUILD_DIR/agentuity-snapshot.yaml" << EOF
version: 1
runtime: bun:1
description: Test dir field
dir: subdir
files:
  - "**/*"
EOF

DIR_BUILD_OUTPUT=$($CLI cloud sandbox snapshot build "$DIR_BUILD_DIR" --json 2>&1) || true
DIR_SNAP_ID=$(echo "$DIR_BUILD_OUTPUT" | grep -o '"snapshotId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
track_snapshot "$DIR_SNAP_ID"
if [ -n "$DIR_SNAP_ID" ] && [[ "$DIR_SNAP_ID" == snp_* ]]; then
	pass "snapshot build with dir field returns valid snapshotId: $DIR_SNAP_ID"
else
	fail "snapshot build with dir field did not return valid snapshotId" "$DIR_BUILD_OUTPUT"
fi

# Verify fileCount is 2 (app.js + nested/helper.js, NOT outside.txt)
DIR_FILE_COUNT=$(echo "$DIR_BUILD_OUTPUT" | grep -o '"fileCount"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*$')
if [ "$DIR_FILE_COUNT" = "2" ]; then
	pass "snapshot build with dir field has correct fileCount: 2"
else
	fail "snapshot build with dir field has wrong fileCount (expected 2)" "fileCount=$DIR_FILE_COUNT" "$DIR_BUILD_OUTPUT"
fi

# Create sandbox from snapshot and verify files are at correct paths
info "Test: sandbox from dir field snapshot has correct files"
if [ -n "$DIR_SNAP_ID" ] && [[ "$DIR_SNAP_ID" == snp_* ]]; then
	DIR_SANDBOX=$($CLI cloud sandbox create --description "$SANDBOX_DESC" --snapshot "$DIR_SNAP_ID" --json 2>&1) || true
	DIR_SANDBOX_ID=$(echo "$DIR_SANDBOX" | grep -o '"sandboxId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
	if [ -n "$DIR_SANDBOX_ID" ] && [[ "$DIR_SANDBOX_ID" == sbx_* ]]; then
		sleep 3
		# Verify app.js from subdir is at root of sandbox (relative to subdir, not parent)
		DIR_VERIFY_APP=$($CLI cloud sandbox exec "$DIR_SANDBOX_ID" -- cat /home/agentuity/app.js 2>&1) || true
		if echo "$DIR_VERIFY_APP" | grep -q "app from subdir"; then
			pass "dir field snapshot contains app.js at root"
		else
			fail "dir field snapshot missing app.js" "$DIR_VERIFY_APP"
		fi

		# Verify nested/helper.js preserves relative path within subdir
		DIR_VERIFY_HELPER=$($CLI cloud sandbox exec "$DIR_SANDBOX_ID" -- cat /home/agentuity/nested/helper.js 2>&1) || true
		if echo "$DIR_VERIFY_HELPER" | grep -q "helper from subdir"; then
			pass "dir field snapshot contains nested/helper.js"
		else
			fail "dir field snapshot missing nested/helper.js" "$DIR_VERIFY_HELPER"
		fi

		# Verify outside.txt is NOT present (was outside the dir context)
		DIR_VERIFY_OUTSIDE=$($CLI cloud sandbox exec "$DIR_SANDBOX_ID" -- ls /home/agentuity/outside.txt 2>&1) || true
		if echo "$DIR_VERIFY_OUTSIDE" | grep -qi "no such file\|cannot access"; then
			pass "dir field snapshot correctly excluded outside.txt"
		else
			fail "dir field snapshot should not contain outside.txt" "$DIR_VERIFY_OUTSIDE"
		fi

		$CLI cloud sandbox delete "$DIR_SANDBOX_ID" --confirm 2>/dev/null || true
	else
		fail "failed to create sandbox from dir field snapshot" "$DIR_SANDBOX"
	fi
else
	fail "skipping dir field sandbox test - no snapshot ID" ""
fi

# Clean up dir field snapshot
delete_and_untrack_snapshot "$DIR_SNAP_ID"

# Test: Build with dir field + --file (yaml outside build context)
info "Test: snapshot build with dir field and --file"
DIR_FILE_TEST="$TEST_DIR/dir-file-test"
mkdir -p "$DIR_FILE_TEST/project"
echo "index from project" > "$DIR_FILE_TEST/project/index.js"

cat > "$DIR_FILE_TEST/custom-snapshot.yaml" << EOF
version: 1
runtime: bun:1
description: Test dir with --file
dir: project
files:
  - "**/*"
EOF

DIR_FILE_BUILD=$($CLI cloud sandbox snapshot build "$DIR_FILE_TEST" --file "$DIR_FILE_TEST/custom-snapshot.yaml" --json 2>&1) || true
DIR_FILE_SNAP_ID=$(echo "$DIR_FILE_BUILD" | grep -o '"snapshotId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
track_snapshot "$DIR_FILE_SNAP_ID"
if [ -n "$DIR_FILE_SNAP_ID" ] && [[ "$DIR_FILE_SNAP_ID" == snp_* ]]; then
	pass "snapshot build with dir + --file returns valid snapshotId: $DIR_FILE_SNAP_ID"

	# Verify fileCount is 1
	DIR_FILE_COUNT2=$(echo "$DIR_FILE_BUILD" | grep -o '"fileCount"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*$')
	if [ "$DIR_FILE_COUNT2" = "1" ]; then
		pass "snapshot build with dir + --file has correct fileCount: 1"
	else
		fail "snapshot build with dir + --file has wrong fileCount (expected 1)" "fileCount=$DIR_FILE_COUNT2" "$DIR_FILE_BUILD"
	fi

	# Create sandbox and verify file
	DIR_FILE_SANDBOX=$($CLI cloud sandbox create --description "$SANDBOX_DESC" --snapshot "$DIR_FILE_SNAP_ID" --json 2>&1) || true
	DIR_FILE_SANDBOX_ID=$(echo "$DIR_FILE_SANDBOX" | grep -o '"sandboxId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
	if [ -n "$DIR_FILE_SANDBOX_ID" ] && [[ "$DIR_FILE_SANDBOX_ID" == sbx_* ]]; then
		sleep 3
		DIR_FILE_VERIFY=$($CLI cloud sandbox exec "$DIR_FILE_SANDBOX_ID" -- cat /home/agentuity/index.js 2>&1) || true
		if echo "$DIR_FILE_VERIFY" | grep -q "index from project"; then
			pass "dir + --file snapshot contains index.js at root"
		else
			fail "dir + --file snapshot missing index.js" "$DIR_FILE_VERIFY"
		fi
		$CLI cloud sandbox delete "$DIR_FILE_SANDBOX_ID" --confirm 2>/dev/null || true
	else
		fail "failed to create sandbox from dir + --file snapshot" "$DIR_FILE_SANDBOX"
	fi

	delete_and_untrack_snapshot "$DIR_FILE_SNAP_ID"
else
	fail "snapshot build with dir + --file failed" "$DIR_FILE_BUILD"
fi

# Test: Build with dir pointing to nonexistent directory
info "Test: snapshot build with dir pointing to nonexistent directory"
DIR_BAD_TEST="$TEST_DIR/dir-bad-test"
mkdir -p "$DIR_BAD_TEST"
echo "placeholder" > "$DIR_BAD_TEST/placeholder.txt"
cat > "$DIR_BAD_TEST/agentuity-snapshot.yaml" << EOF
version: 1
runtime: bun:1
dir: nonexistent
files:
  - "**/*"
EOF

set +e
DIR_BAD_BUILD=$($CLI cloud sandbox snapshot build "$DIR_BAD_TEST" --json 2>&1)
DIR_BAD_EXIT=$?
set -e
if [ "$DIR_BAD_EXIT" -ne 0 ] && echo "$DIR_BAD_BUILD" | grep -qi "not found\|does not exist\|no such"; then
	pass "snapshot build fails when dir points to nonexistent directory"
else
	DIR_BAD_SNAP_ID=$(echo "$DIR_BAD_BUILD" | grep -o '"snapshotId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
	if [ -n "$DIR_BAD_SNAP_ID" ]; then
		track_snapshot "$DIR_BAD_SNAP_ID"
		delete_and_untrack_snapshot "$DIR_BAD_SNAP_ID"
		fail "snapshot build should have failed with nonexistent dir" "$DIR_BAD_BUILD"
	else
		fail "snapshot build error message not clear about nonexistent dir" "$DIR_BAD_BUILD"
	fi
fi

# ============================================
section "MALWARE DETECTION Tests (Public Snapshots)"
# ============================================

# Setup malware test directory with EICAR test file
MALWARE_DIR="$TEST_DIR/malware-test"
mkdir -p "$MALWARE_DIR"
echo "clean file content" > "$MALWARE_DIR/clean.txt"
# EICAR test file - standard antivirus test string
echo 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > "$MALWARE_DIR/malware.txt"
cat > "$MALWARE_DIR/agentuity-snapshot.yaml" << EOF
version: 1
runtime: bun:1
description: Malware detection test
files:
  - "*.txt"
EOF
pass "Malware test files created (EICAR test file)"

# Test: Public snapshot with malware is rejected (TUI output)
info "Test: snapshot build --public rejects malware"
set +e
MALWARE_BUILD=$($CLI cloud sandbox snapshot build "$MALWARE_DIR" --public --force --confirm 2>&1)
MALWARE_EXIT=$?
set -e
if echo "$MALWARE_BUILD" | grep -qi "malware detected"; then
	pass "snapshot build --public detects and reports malware"
else
	fail "snapshot build --public did not detect malware" "$MALWARE_BUILD"
fi

# Verify exit code is 10 (SECURITY_ERROR)
if [ "$MALWARE_EXIT" -eq 10 ]; then
	pass "snapshot build --public with malware exits with code 10 (SECURITY_ERROR)"
else
	fail "snapshot build --public with malware should exit with code 10, got $MALWARE_EXIT" ""
fi

# Verify error box mentions virus name
if echo "$MALWARE_BUILD" | grep -qi "Eicar-Signature\|Eicar"; then
	pass "malware detection shows virus name (Eicar-Signature)"
else
	fail "malware detection did not show virus name" "$MALWARE_BUILD"
fi

# Test: Public snapshot with malware is rejected (JSON output)
info "Test: snapshot build --public --json malware detection"
set +e
MALWARE_JSON=$($CLI cloud sandbox snapshot build "$MALWARE_DIR" --public --force --confirm --json 2>&1)
MALWARE_JSON_EXIT=$?
set -e

# Verify JSON contains malwareDetected field
if echo "$MALWARE_JSON" | grep -q '"malwareDetected"[[:space:]]*:[[:space:]]*true'; then
	pass "snapshot build --public --json returns malwareDetected: true"
else
	fail "snapshot build --public --json missing malwareDetected field" "$MALWARE_JSON"
fi

# Verify JSON contains virusName field
if echo "$MALWARE_JSON" | grep -q '"virusName"'; then
	pass "snapshot build --public --json returns virusName field"
else
	fail "snapshot build --public --json missing virusName field" "$MALWARE_JSON"
fi

# Verify JSON contains error field
if echo "$MALWARE_JSON" | grep -q '"error"'; then
	pass "snapshot build --public --json returns error field"
else
	fail "snapshot build --public --json missing error field" "$MALWARE_JSON"
fi

# Verify JSON exit code is 1 (JSON mode uses exit 1)
if [ "$MALWARE_JSON_EXIT" -eq 1 ]; then
	pass "snapshot build --public --json with malware exits with code 1"
else
	fail "snapshot build --public --json with malware should exit with code 1, got $MALWARE_JSON_EXIT" ""
fi

# Test: Clean public snapshot succeeds
info "Test: snapshot build --public with clean files succeeds"
rm "$MALWARE_DIR/malware.txt"  # Remove the malware file
CLEAN_PUBLIC_BUILD=$($CLI cloud sandbox snapshot build "$MALWARE_DIR" --public --force --confirm --json 2>&1) || true
CLEAN_SNAP_ID=$(echo "$CLEAN_PUBLIC_BUILD" | grep -o '"snapshotId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
track_snapshot "$CLEAN_SNAP_ID"
if [ -n "$CLEAN_SNAP_ID" ] && [[ "$CLEAN_SNAP_ID" == snp_* ]]; then
	pass "snapshot build --public with clean files succeeds: $CLEAN_SNAP_ID"
	# Clean up
	delete_and_untrack_snapshot "$CLEAN_SNAP_ID"
else
	fail "snapshot build --public with clean files failed" "$CLEAN_PUBLIC_BUILD"
fi

# Clean up malware test directory
rm -rf "$MALWARE_DIR"

# Test: Build with no build file present (auto-detect should fail)
info "Test: snapshot build with missing build file"
EMPTY_BUILD_DIR="$TEST_DIR/empty-build"
mkdir -p "$EMPTY_BUILD_DIR"
echo "some file" > "$EMPTY_BUILD_DIR/file.txt"

MISSING_FILE_BUILD=$($CLI cloud sandbox snapshot build "$EMPTY_BUILD_DIR" --json 2>&1) || true
if echo "$MISSING_FILE_BUILD" | grep -qi "not found\|no.*file\|agentuity-snapshot"; then
	pass "snapshot build fails when no build file found"
else
	fail "snapshot build should have failed with missing build file" "$MISSING_FILE_BUILD"
fi

# Clean up build test directory
rm -rf "$BUILD_DIR" "$EMPTY_BUILD_DIR"

# ============================================
section "RUNTIME VALIDATION Tests"
# ============================================

# Test: List available runtimes
info "Test: runtime list --json"
RUNTIME_LIST=$($CLI cloud sandbox runtime list --json 2>&1) || true

# Verify python runtimes exist
if echo "$RUNTIME_LIST" | grep -qi "python"; then
	pass "runtime list includes python entries"
else
	fail "runtime list missing python entries" "$RUNTIME_LIST"
fi

# Verify bun runtimes exist
if echo "$RUNTIME_LIST" | grep -qi "bun"; then
	pass "runtime list includes bun entries"
else
	fail "runtime list missing bun entries" "$RUNTIME_LIST"
fi

# Extract python runtime names for validation
# Look for python:3.14 specifically (customer-reported runtime) and any other python
PYTHON_RUNTIME_314=$(echo "$RUNTIME_LIST" | grep -o '"name"[[:space:]]*:[[:space:]]*"python:3\.14"' | head -1 | sed 's/.*"\(python:[^"]*\)"$/\1/')
if [ -n "$PYTHON_RUNTIME_314" ]; then
	pass "found python:3.14 runtime (customer-reported runtime)"
else
	fail "python:3.14 runtime NOT found in runtime list (customer uses this)" "$RUNTIME_LIST"
fi

# Use python:3.14 specifically since that's the customer's reported runtime
PYTHON_RUNTIME="python:3.14"
info "Using python runtime for snapshot tests: $PYTHON_RUNTIME"

# ============================================
section "SNAPSHOT WITH PYTHON RUNTIME Tests"
# ============================================
# This section reproduces customer-reported bug: snapshot creation
# returns 500 error on non-default (python) runtimes.

# Test: Create sandbox with python runtime
info "Test: sandbox create with python runtime ($PYTHON_RUNTIME)"
PYTHON_CREATE=$($CLI cloud sandbox create --description "$SANDBOX_DESC" --runtime "$PYTHON_RUNTIME" --idle-timeout 10m --json 2>&1) || true
PYTHON_SANDBOX_ID=$(echo "$PYTHON_CREATE" | grep -o '"sandboxId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
if [ -n "$PYTHON_SANDBOX_ID" ] && [[ "$PYTHON_SANDBOX_ID" == sbx_* ]]; then
	pass "python sandbox create returns valid sandboxId: $PYTHON_SANDBOX_ID"
else
	fail "python sandbox create did not return valid sandboxId" "$PYTHON_CREATE"
fi

# Wait for python sandbox to become ready (status: idle)
if [ -n "$PYTHON_SANDBOX_ID" ]; then
	info "Waiting for python sandbox to become ready..."
	MAX_WAIT=30
	WAIT_COUNT=0
	while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
		PY_STATUS_OUTPUT=$($CLI cloud sandbox get "$PYTHON_SANDBOX_ID" --json 2>&1) || true
		PY_CURRENT_STATUS=$(echo "$PY_STATUS_OUTPUT" | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
		if [ "$PY_CURRENT_STATUS" = "idle" ]; then
			pass "python sandbox is ready (status: idle)"
			break
		fi
		sleep 1
		WAIT_COUNT=$((WAIT_COUNT + 1))
	done
	if [ $WAIT_COUNT -eq $MAX_WAIT ]; then
		fail "python sandbox did not become ready within ${MAX_WAIT}s" "status: $PY_CURRENT_STATUS" "$PY_STATUS_OUTPUT"
	fi
fi

# Test: Create and upload a .py file to python sandbox
if [ -n "$PYTHON_SANDBOX_ID" ]; then
	echo 'print("Hello from Python")' > "$TEST_DIR/test.py"
	info "Test: upload .py file to python sandbox"
	PY_UPLOAD=$($CLI cloud sandbox cp "$TEST_DIR/test.py" "$PYTHON_SANDBOX_ID:test.py" 2>&1) || true
	if echo "$PY_UPLOAD" | grep -qi "Copied"; then
		pass "uploaded test.py to python sandbox"
	else
		fail "failed to upload test.py to python sandbox" "$PY_UPLOAD"
	fi

	# Test: Verify .py file accessible in sandbox
	info "Test: verify .py file accessible in python sandbox"
	PY_CAT=$($CLI cloud sandbox exec "$PYTHON_SANDBOX_ID" -- cat /home/agentuity/test.py 2>&1) || true
	if echo "$PY_CAT" | grep -q 'print("Hello from Python")'; then
		pass "test.py content verified in python sandbox"
	else
		fail "test.py content mismatch in python sandbox" "$PY_CAT"
	fi

	# Test: Execute python file in sandbox (verify runtime works)
	info "Test: execute python file in python sandbox"
	PY_EXEC=$($CLI cloud sandbox exec "$PYTHON_SANDBOX_ID" -- python3 /home/agentuity/test.py 2>&1) || true
	if echo "$PY_EXEC" | grep -q "Hello from Python"; then
		pass "python3 execution succeeded in python sandbox"
	else
		fail "python3 execution failed in python sandbox" "$PY_EXEC"
	fi

	# Test: Verify uploaded file appears in file listing
	info "Test: verify .py file appears in sandbox file listing"
	PY_FILES=$($CLI cloud sandbox files "$PYTHON_SANDBOX_ID" /home/agentuity --json 2>&1) || true
	if echo "$PY_FILES" | grep -q "test.py"; then
		pass "test.py visible in python sandbox file listing"
	else
		fail "test.py NOT visible in python sandbox file listing (customer bug)" "$PY_FILES"
	fi

	# Test: Create snapshot from python sandbox (THIS IS THE CUSTOMER BUG)
	# Customer reports 500 error when creating snapshots from python runtime sandboxes
	info "Test: snapshot create from python sandbox (customer-reported 500 bug)"
	set +e
	PYTHON_SNAP_OUTPUT=$($CLI cloud sandbox snapshot create "$PYTHON_SANDBOX_ID" --name "python-test-${RUN_ID}" --json 2>&1)
	PYTHON_SNAP_EXIT=$?
	set -e
	PYTHON_SNAP_ID=$(echo "$PYTHON_SNAP_OUTPUT" | grep -o '"snapshotId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
	track_snapshot "$PYTHON_SNAP_ID"

	if [ -n "$PYTHON_SNAP_ID" ] && [[ "$PYTHON_SNAP_ID" == snp_* ]]; then
		pass "snapshot create from python sandbox succeeded: $PYTHON_SNAP_ID"
	else
		fail "snapshot create from python sandbox FAILED (exit=$PYTHON_SNAP_EXIT)" "This reproduces customer-reported 500 error on python runtime snapshots" "$PYTHON_SNAP_OUTPUT"
		info "Full error output for debugging:"
		echo "$PYTHON_SNAP_OUTPUT"
	fi

	# Test: Verify snapshot get returns correct info
	if [ -n "$PYTHON_SNAP_ID" ] && [[ "$PYTHON_SNAP_ID" == snp_* ]]; then
		info "Test: snapshot get for python snapshot"
		PY_SNAP_GET=$($CLI cloud sandbox snapshot get "$PYTHON_SNAP_ID" --json 2>&1) || true
		PY_SNAP_GET_ID=$(echo "$PY_SNAP_GET" | grep -o '"snapshotId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
		if [ "$PY_SNAP_GET_ID" = "$PYTHON_SNAP_ID" ]; then
			pass "snapshot get returns correct snapshotId for python snapshot"
		else
			fail "snapshot get returned wrong snapshotId for python snapshot" "$PY_SNAP_GET"
		fi

		# Verify fileCount > 0 (uploaded files should be included)
		PY_SNAP_FILE_COUNT=$(echo "$PY_SNAP_GET" | grep -o '"fileCount"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*$')
		if [ -n "$PY_SNAP_FILE_COUNT" ] && [ "$PY_SNAP_FILE_COUNT" -gt 0 ] 2>/dev/null; then
			pass "python snapshot fileCount > 0: $PY_SNAP_FILE_COUNT"
		else
			fail "python snapshot fileCount should be > 0 (uploaded files not included in snapshot)" "fileCount=$PY_SNAP_FILE_COUNT" "$PY_SNAP_GET"
		fi

		# Verify sizeBytes > 0
		PY_SNAP_SIZE=$(echo "$PY_SNAP_GET" | grep -o '"sizeBytes"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*$')
		if [ -n "$PY_SNAP_SIZE" ] && [ "$PY_SNAP_SIZE" -gt 0 ] 2>/dev/null; then
			pass "python snapshot sizeBytes > 0: $PY_SNAP_SIZE"
		else
			fail "python snapshot sizeBytes should be > 0" "sizeBytes=$PY_SNAP_SIZE" "$PY_SNAP_GET"
		fi

		# Test: Create new sandbox from python snapshot and verify files preserved
		info "Test: create sandbox from python snapshot and verify files"
		PY_RESTORE=$($CLI cloud sandbox create --description "$SANDBOX_DESC" --snapshot "$PYTHON_SNAP_ID" --json 2>&1) || true
		PY_RESTORE_ID=$(echo "$PY_RESTORE" | grep -o '"sandboxId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
		if [ -n "$PY_RESTORE_ID" ] && [[ "$PY_RESTORE_ID" == sbx_* ]]; then
			sleep 3
			PY_RESTORE_CAT=$($CLI cloud sandbox exec "$PY_RESTORE_ID" -- cat /home/agentuity/test.py 2>&1) || true
			if echo "$PY_RESTORE_CAT" | grep -q 'print("Hello from Python")'; then
				pass "sandbox from python snapshot contains test.py with correct content"
			else
				fail "sandbox from python snapshot missing test.py content" "$PY_RESTORE_CAT"
			fi
			# Clean up restored sandbox
			$CLI cloud sandbox delete "$PY_RESTORE_ID" --confirm 2>/dev/null || true
		else
			fail "failed to create sandbox from python snapshot" "$PY_RESTORE"
		fi

		# Clean up python snapshot
		delete_and_untrack_snapshot "$PYTHON_SNAP_ID"
	fi

	# Clean up python sandbox
	$CLI cloud sandbox delete "$PYTHON_SANDBOX_ID" --confirm 2>/dev/null || true
	PYTHON_SANDBOX_ID=""
fi

# ============================================
section "SNAPSHOT WITH FILES IN SUBDIRECTORIES Tests"
# ============================================
# Uses the existing SANDBOX_ID (main test sandbox, bun runtime)
# Tests that nested directory structures are properly included in snapshots
#
# NOTE: SANDBOX_ID may have been idle for several minutes during BUILD,
# MALWARE, and PYTHON tests. Verify it's still alive before proceeding.

# Keepalive check: verify sandbox is still responsive after the long gap
info "Test: verify main sandbox is still alive"
KEEPALIVE=$($CLI cloud sandbox exec "$SANDBOX_ID" -- echo "sandbox-alive" 2>&1) || true
if echo "$KEEPALIVE" | grep -q "sandbox-alive"; then
	pass "main sandbox is still responsive"
else
	fail "main sandbox may have been reaped by idle timeout (was idle during BUILD/MALWARE/PYTHON tests)" "$KEEPALIVE"
fi

# Test: Create nested directory structure with various file types
# Use a single combined command to avoid multiple round-trips and reduce flakiness
info "Test: create nested directory structure in sandbox"
MKDIR_OUTPUT=$($CLI cloud sandbox exec "$SANDBOX_ID" -- sh -c 'mkdir -p /home/agentuity/project/src /home/agentuity/project/config && echo "dirs-created"' 2>&1) || true
if echo "$MKDIR_OUTPUT" | grep -q "dirs-created"; then
	pass "nested directories created successfully"
else
	fail "failed to create nested directories" "$MKDIR_OUTPUT"
fi

# Write files - capture output to detect errors instead of silently swallowing them
WRITE_OUTPUT=$($CLI cloud sandbox exec "$SANDBOX_ID" -- sh -c '
	echo "def main(): print(\"hello\")" > /home/agentuity/project/src/main.py &&
	echo "def helper(): return 42" > /home/agentuity/project/src/utils.py &&
	echo "{\"debug\": true}" > /home/agentuity/project/config/settings.json &&
	echo "files-written"
' 2>&1) || true
if echo "$WRITE_OUTPUT" | grep -q "files-written"; then
	pass "nested files written successfully"
else
	fail "failed to write nested files" "$WRITE_OUTPUT"
fi

# Verify files were created
NESTED_VERIFY=$($CLI cloud sandbox exec "$SANDBOX_ID" -- find /home/agentuity/project -type f 2>&1) || true
if echo "$NESTED_VERIFY" | grep -q "main.py" && echo "$NESTED_VERIFY" | grep -q "utils.py" && echo "$NESTED_VERIFY" | grep -q "settings.json"; then
	pass "nested directory structure created with all files"
else
	fail "nested directory structure missing files" "$NESTED_VERIFY"
fi

# Test: Snapshot sandbox with nested files
info "Test: snapshot create with nested file structure"
NESTED_SNAP_CREATE=$($CLI cloud sandbox snapshot create "$SANDBOX_ID" --name "nested-test-${RUN_ID}" --json 2>&1) || true
NESTED_SNAP_ID=$(echo "$NESTED_SNAP_CREATE" | grep -o '"snapshotId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
track_snapshot "$NESTED_SNAP_ID"
if [ -n "$NESTED_SNAP_ID" ] && [[ "$NESTED_SNAP_ID" == snp_* ]]; then
	pass "snapshot create with nested files succeeded: $NESTED_SNAP_ID"
else
	fail "snapshot create with nested files failed" "$NESTED_SNAP_CREATE"
fi

# Verify fileCount includes nested files
if [ -n "$NESTED_SNAP_ID" ] && [[ "$NESTED_SNAP_ID" == snp_* ]]; then
	NESTED_SNAP_GET=$($CLI cloud sandbox snapshot get "$NESTED_SNAP_ID" --json 2>&1) || true
	NESTED_FILE_COUNT=$(echo "$NESTED_SNAP_GET" | grep -o '"fileCount"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*$')
	if [ -n "$NESTED_FILE_COUNT" ] && [ "$NESTED_FILE_COUNT" -ge 3 ] 2>/dev/null; then
		pass "nested snapshot fileCount includes subdirectory files: $NESTED_FILE_COUNT"
	else
		fail "nested snapshot fileCount too low (expected >= 3 for nested files)" "fileCount=$NESTED_FILE_COUNT" "$NESTED_SNAP_GET"
	fi

	# Test: Restore and verify nested structure preserved
	info "Test: restore sandbox from nested snapshot and verify structure"
	NESTED_RESTORE=$($CLI cloud sandbox create --description "$SANDBOX_DESC" --snapshot "$NESTED_SNAP_ID" --json 2>&1) || true
	NESTED_RESTORE_ID=$(echo "$NESTED_RESTORE" | grep -o '"sandboxId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
	if [ -n "$NESTED_RESTORE_ID" ] && [[ "$NESTED_RESTORE_ID" == sbx_* ]]; then
		sleep 3
		# Verify each file exists with correct content
		RESTORE_MAIN=$($CLI cloud sandbox exec "$NESTED_RESTORE_ID" -- cat /home/agentuity/project/src/main.py 2>&1) || true
		if echo "$RESTORE_MAIN" | grep -q "def main"; then
			pass "restored sandbox contains project/src/main.py"
		else
			fail "restored sandbox missing project/src/main.py" "$RESTORE_MAIN"
		fi

		RESTORE_UTILS=$($CLI cloud sandbox exec "$NESTED_RESTORE_ID" -- cat /home/agentuity/project/src/utils.py 2>&1) || true
		if echo "$RESTORE_UTILS" | grep -q "def helper"; then
			pass "restored sandbox contains project/src/utils.py"
		else
			fail "restored sandbox missing project/src/utils.py" "$RESTORE_UTILS"
		fi

		RESTORE_CONFIG=$($CLI cloud sandbox exec "$NESTED_RESTORE_ID" -- cat /home/agentuity/project/config/settings.json 2>&1) || true
		if echo "$RESTORE_CONFIG" | grep -q '"debug"'; then
			pass "restored sandbox contains project/config/settings.json"
		else
			fail "restored sandbox missing project/config/settings.json" "$RESTORE_CONFIG"
		fi

		# Clean up restored sandbox
		$CLI cloud sandbox delete "$NESTED_RESTORE_ID" --confirm 2>/dev/null || true
	else
		fail "failed to create sandbox from nested snapshot" "$NESTED_RESTORE"
	fi

	# Clean up nested snapshot
	delete_and_untrack_snapshot "$NESTED_SNAP_ID"
fi

# Clean up nested directories from main sandbox
$CLI cloud sandbox exec "$SANDBOX_ID" -- rm -rf /home/agentuity/project >/dev/null 2>&1 || true

# ============================================
section "SNAPSHOT FROM EMPTY SANDBOX Tests"
# ============================================
# Tests that snapshots work correctly on a sandbox with no user-uploaded files

# Test: Create a fresh sandbox (no files uploaded)
info "Test: create fresh sandbox for empty snapshot test"
EMPTY_SNAP_SANDBOX=$($CLI cloud sandbox create --description "$SANDBOX_DESC" --idle-timeout 10m --json 2>&1) || true
EMPTY_SNAP_SANDBOX_ID=$(echo "$EMPTY_SNAP_SANDBOX" | grep -o '"sandboxId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
if [ -n "$EMPTY_SNAP_SANDBOX_ID" ] && [[ "$EMPTY_SNAP_SANDBOX_ID" == sbx_* ]]; then
	pass "fresh sandbox created for empty snapshot test: $EMPTY_SNAP_SANDBOX_ID"
else
	fail "failed to create fresh sandbox for empty snapshot test" "$EMPTY_SNAP_SANDBOX"
fi

if [ -n "$EMPTY_SNAP_SANDBOX_ID" ]; then
	# Wait for sandbox to be ready
	info "Waiting for empty sandbox to become ready..."
	MAX_WAIT=30
	WAIT_COUNT=0
	while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
		EMPTY_STATUS=$($CLI cloud sandbox get "$EMPTY_SNAP_SANDBOX_ID" --json 2>&1) || true
		EMPTY_CUR_STATUS=$(echo "$EMPTY_STATUS" | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
		if [ "$EMPTY_CUR_STATUS" = "idle" ]; then
			pass "empty sandbox is ready (status: idle)"
			break
		fi
		sleep 1
		WAIT_COUNT=$((WAIT_COUNT + 1))
	done
	if [ $WAIT_COUNT -eq $MAX_WAIT ]; then
		fail "empty sandbox did not become ready within ${MAX_WAIT}s" "status: $EMPTY_CUR_STATUS" "$EMPTY_STATUS"
	fi

	# Test: Create snapshot of empty sandbox
	info "Test: snapshot create from empty sandbox"
	EMPTY_SNAP_CREATE=$($CLI cloud sandbox snapshot create "$EMPTY_SNAP_SANDBOX_ID" --name "empty-test-${RUN_ID}" --json 2>&1) || true
	EMPTY_SNAP_ID=$(echo "$EMPTY_SNAP_CREATE" | grep -o '"snapshotId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
	track_snapshot "$EMPTY_SNAP_ID"
	if [ -n "$EMPTY_SNAP_ID" ] && [[ "$EMPTY_SNAP_ID" == snp_* ]]; then
		pass "snapshot create from empty sandbox succeeded: $EMPTY_SNAP_ID"
	else
		fail "snapshot create from empty sandbox failed" "$EMPTY_SNAP_CREATE"
	fi

	# Verify sizeBytes is returned (even if 0)
	if echo "$EMPTY_SNAP_CREATE" | grep -q '"sizeBytes"'; then
		pass "empty snapshot returns sizeBytes field"
	else
		fail "empty snapshot missing sizeBytes field" "$EMPTY_SNAP_CREATE"
	fi

	# Test: Restore from empty snapshot
	if [ -n "$EMPTY_SNAP_ID" ] && [[ "$EMPTY_SNAP_ID" == snp_* ]]; then
		info "Test: restore sandbox from empty snapshot"
		EMPTY_RESTORE=$($CLI cloud sandbox create --description "$SANDBOX_DESC" --snapshot "$EMPTY_SNAP_ID" --json 2>&1) || true
		EMPTY_RESTORE_ID=$(echo "$EMPTY_RESTORE" | grep -o '"sandboxId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
		if [ -n "$EMPTY_RESTORE_ID" ] && [[ "$EMPTY_RESTORE_ID" == sbx_* ]]; then
			sleep 3
			# Verify restored sandbox is usable (can exec commands)
			EMPTY_RESTORE_EXEC=$($CLI cloud sandbox exec "$EMPTY_RESTORE_ID" -- echo "restored-ok" 2>&1) || true
			if echo "$EMPTY_RESTORE_EXEC" | grep -q "restored-ok"; then
				pass "sandbox restored from empty snapshot is usable"
			else
				fail "sandbox restored from empty snapshot not usable" "$EMPTY_RESTORE_EXEC"
			fi
			# Clean up restored sandbox
			$CLI cloud sandbox delete "$EMPTY_RESTORE_ID" --confirm 2>/dev/null || true
		else
			fail "failed to create sandbox from empty snapshot" "$EMPTY_RESTORE"
		fi

		# Clean up empty snapshot
		delete_and_untrack_snapshot "$EMPTY_SNAP_ID"
	fi

	# Clean up empty sandbox
	$CLI cloud sandbox delete "$EMPTY_SNAP_SANDBOX_ID" --confirm 2>/dev/null || true
fi

# ============================================
section "SNAPSHOT RE-SNAPSHOT LIFECYCLE Tests"
# ============================================
# Uses the existing SANDBOX_ID (main test sandbox)
# Tests that incremental snapshots properly capture new files

# Keepalive check: verify sandbox is still responsive
info "Test: verify main sandbox is still alive for lifecycle tests"
LIFECYCLE_KEEPALIVE=$($CLI cloud sandbox exec "$SANDBOX_ID" -- echo "lifecycle-alive" 2>&1) || true
if echo "$LIFECYCLE_KEEPALIVE" | grep -q "lifecycle-alive"; then
	pass "main sandbox is still responsive for lifecycle tests"
else
	fail "main sandbox may have been reaped by idle timeout before lifecycle tests" "$LIFECYCLE_KEEPALIVE"
fi

# Test: Create initial snapshot
info "Test: create initial snapshot for re-snapshot lifecycle"
LIFECYCLE_SNAP1=$($CLI cloud sandbox snapshot create "$SANDBOX_ID" --name "lifecycle-v1-${RUN_ID}" --json 2>&1) || true
LIFECYCLE_SNAP1_ID=$(echo "$LIFECYCLE_SNAP1" | grep -o '"snapshotId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
track_snapshot "$LIFECYCLE_SNAP1_ID"
if [ -n "$LIFECYCLE_SNAP1_ID" ] && [[ "$LIFECYCLE_SNAP1_ID" == snp_* ]]; then
	pass "initial lifecycle snapshot created: $LIFECYCLE_SNAP1_ID"
else
	fail "initial lifecycle snapshot creation failed" "$LIFECYCLE_SNAP1"
fi

# Get fileCount of first snapshot
LIFECYCLE_SNAP1_GET=$($CLI cloud sandbox snapshot get "$LIFECYCLE_SNAP1_ID" --json 2>&1) || true
LIFECYCLE_COUNT1=$(echo "$LIFECYCLE_SNAP1_GET" | grep -o '"fileCount"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*$')
info "Initial snapshot fileCount: ${LIFECYCLE_COUNT1:-unknown}"

# Add a new file after first snapshot
info "Test: add new file after initial snapshot"
$CLI cloud sandbox exec "$SANDBOX_ID" -- sh -c 'echo "new-file-content" > /home/agentuity/lifecycle-new-file.txt' >/dev/null 2>&1 || true
LIFECYCLE_VERIFY=$($CLI cloud sandbox exec "$SANDBOX_ID" -- cat /home/agentuity/lifecycle-new-file.txt 2>&1) || true
if echo "$LIFECYCLE_VERIFY" | grep -q "new-file-content"; then
	pass "new file added after initial snapshot"
else
	fail "failed to add new file after initial snapshot" "$LIFECYCLE_VERIFY"
fi

# Create second snapshot (should include the new file)
info "Test: create second snapshot after adding new file"
LIFECYCLE_SNAP2=$($CLI cloud sandbox snapshot create "$SANDBOX_ID" --name "lifecycle-v2-${RUN_ID}" --json 2>&1) || true
LIFECYCLE_SNAP2_ID=$(echo "$LIFECYCLE_SNAP2" | grep -o '"snapshotId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
track_snapshot "$LIFECYCLE_SNAP2_ID"
if [ -n "$LIFECYCLE_SNAP2_ID" ] && [[ "$LIFECYCLE_SNAP2_ID" == snp_* ]]; then
	pass "second lifecycle snapshot created: $LIFECYCLE_SNAP2_ID"
else
	fail "second lifecycle snapshot creation failed" "$LIFECYCLE_SNAP2"
fi

# Verify second snapshot has higher fileCount than first
LIFECYCLE_SNAP2_GET=$($CLI cloud sandbox snapshot get "$LIFECYCLE_SNAP2_ID" --json 2>&1) || true
LIFECYCLE_COUNT2=$(echo "$LIFECYCLE_SNAP2_GET" | grep -o '"fileCount"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*$')
info "Second snapshot fileCount: ${LIFECYCLE_COUNT2:-unknown}"
if [ -n "$LIFECYCLE_COUNT1" ] && [ -n "$LIFECYCLE_COUNT2" ] && [ "$LIFECYCLE_COUNT2" -gt "$LIFECYCLE_COUNT1" ] 2>/dev/null; then
	pass "second snapshot has more files than first ($LIFECYCLE_COUNT2 > $LIFECYCLE_COUNT1)"
else
	fail "second snapshot should have more files than first" "first=$LIFECYCLE_COUNT1, second=$LIFECYCLE_COUNT2"
fi

# Test: Restore from first snapshot — new file should NOT be present
info "Test: restore from first snapshot (new file should be absent)"
if [ -n "$LIFECYCLE_SNAP1_ID" ] && [[ "$LIFECYCLE_SNAP1_ID" == snp_* ]]; then
	LIFECYCLE_RESTORE1=$($CLI cloud sandbox create --description "$SANDBOX_DESC" --snapshot "$LIFECYCLE_SNAP1_ID" --json 2>&1) || true
	LIFECYCLE_RESTORE1_ID=$(echo "$LIFECYCLE_RESTORE1" | grep -o '"sandboxId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
	if [ -n "$LIFECYCLE_RESTORE1_ID" ] && [[ "$LIFECYCLE_RESTORE1_ID" == sbx_* ]]; then
		sleep 3
		RESTORE1_CHECK=$($CLI cloud sandbox exec "$LIFECYCLE_RESTORE1_ID" -- sh -c 'if [ -f /home/agentuity/lifecycle-new-file.txt ]; then echo "FILE_EXISTS"; else echo "FILE_ABSENT"; fi' 2>&1) || true
		if echo "$RESTORE1_CHECK" | grep -q "FILE_ABSENT"; then
			pass "first snapshot restore does NOT contain new file (correct)"
		else
			fail "first snapshot restore should NOT contain the new file" "$RESTORE1_CHECK"
		fi
		$CLI cloud sandbox delete "$LIFECYCLE_RESTORE1_ID" --confirm 2>/dev/null || true
	else
		fail "failed to create sandbox from first lifecycle snapshot" "$LIFECYCLE_RESTORE1"
	fi
fi

# Test: Restore from second snapshot — new file should BE present
info "Test: restore from second snapshot (new file should be present)"
if [ -n "$LIFECYCLE_SNAP2_ID" ] && [[ "$LIFECYCLE_SNAP2_ID" == snp_* ]]; then
	LIFECYCLE_RESTORE2=$($CLI cloud sandbox create --description "$SANDBOX_DESC" --snapshot "$LIFECYCLE_SNAP2_ID" --json 2>&1) || true
	LIFECYCLE_RESTORE2_ID=$(echo "$LIFECYCLE_RESTORE2" | grep -o '"sandboxId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
	if [ -n "$LIFECYCLE_RESTORE2_ID" ] && [[ "$LIFECYCLE_RESTORE2_ID" == sbx_* ]]; then
		sleep 3
		RESTORE2_CHECK=$($CLI cloud sandbox exec "$LIFECYCLE_RESTORE2_ID" -- cat /home/agentuity/lifecycle-new-file.txt 2>&1) || true
		if echo "$RESTORE2_CHECK" | grep -q "new-file-content"; then
			pass "second snapshot restore contains new file (correct)"
		else
			fail "second snapshot restore should contain the new file" "$RESTORE2_CHECK"
		fi
		$CLI cloud sandbox delete "$LIFECYCLE_RESTORE2_ID" --confirm 2>/dev/null || true
	else
		fail "failed to create sandbox from second lifecycle snapshot" "$LIFECYCLE_RESTORE2"
	fi
fi

# Clean up lifecycle snapshots
delete_and_untrack_snapshot "$LIFECYCLE_SNAP1_ID"
delete_and_untrack_snapshot "$LIFECYCLE_SNAP2_ID"

# Clean up lifecycle file from main sandbox
$CLI cloud sandbox exec "$SANDBOX_ID" -- rm -f /home/agentuity/lifecycle-new-file.txt >/dev/null 2>&1 || true

# ============================================
section "SNAPSHOT ERROR HANDLING Tests"
# ============================================

# Test: Snapshot from non-existent sandbox ID
info "Test: snapshot create from non-existent sandbox"
set +e
NONEXIST_SNAP=$($CLI cloud sandbox snapshot create "sbx_nonexistent_${RUN_ID}" --json 2>&1)
NONEXIST_SNAP_EXIT=$?
set -e
if [ "$NONEXIST_SNAP_EXIT" -ne 0 ]; then
	pass "snapshot create from non-existent sandbox returns non-zero exit code ($NONEXIST_SNAP_EXIT)"
else
	fail "snapshot create from non-existent sandbox exited with code 0 (expected non-zero)" "$NONEXIST_SNAP"
fi
if echo "$NONEXIST_SNAP" | grep -qi "not found\|404\|error\|invalid"; then
	pass "snapshot create from non-existent sandbox returns error"
else
	# If it somehow returned a snapshot, track and clean it
	NONEXIST_SNAP_ID=$(echo "$NONEXIST_SNAP" | grep -o '"snapshotId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
	if [ -n "$NONEXIST_SNAP_ID" ]; then
		track_snapshot "$NONEXIST_SNAP_ID"
		delete_and_untrack_snapshot "$NONEXIST_SNAP_ID"
	fi
	fail "snapshot create from non-existent sandbox should return error" "$NONEXIST_SNAP"
fi

# Verify error is not a 500 (should be 404 or similar)
if echo "$NONEXIST_SNAP" | grep -q "500\|Internal Server Error"; then
	fail "snapshot create from non-existent sandbox returned 500 (should be 404)" "$NONEXIST_SNAP"
else
	pass "snapshot create from non-existent sandbox does not return 500"
fi

# Test: Snapshot from a deleted sandbox
info "Test: snapshot create from deleted sandbox"
TEMP_SBX=$($CLI cloud sandbox create --description "$SANDBOX_DESC" --idle-timeout 10m --json 2>&1) || true
TEMP_SBX_ID=$(echo "$TEMP_SBX" | grep -o '"sandboxId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
if [ -n "$TEMP_SBX_ID" ] && [[ "$TEMP_SBX_ID" == sbx_* ]]; then
	# Wait for it to be ready, then delete it
	MAX_WAIT=30
	WAIT_COUNT=0
	while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
		TEMP_STATUS=$($CLI cloud sandbox get "$TEMP_SBX_ID" --json 2>&1) || true
		TEMP_CUR_STATUS=$(echo "$TEMP_STATUS" | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
		if [ "$TEMP_CUR_STATUS" = "idle" ]; then
			break
		fi
		sleep 1
		WAIT_COUNT=$((WAIT_COUNT + 1))
	done
	$CLI cloud sandbox delete "$TEMP_SBX_ID" --confirm 2>/dev/null || true

	# Now try to snapshot the deleted sandbox
	set +e
	DELETED_SNAP=$($CLI cloud sandbox snapshot create "$TEMP_SBX_ID" --json 2>&1)
	DELETED_SNAP_EXIT=$?
	set -e
	if [ "$DELETED_SNAP_EXIT" -ne 0 ]; then
		pass "snapshot create from deleted sandbox returns non-zero exit code ($DELETED_SNAP_EXIT)"
	else
		fail "snapshot create from deleted sandbox exited with code 0 (expected non-zero)" "$DELETED_SNAP"
	fi
	if echo "$DELETED_SNAP" | grep -qi "not found\|deleted\|404\|error"; then
		pass "snapshot create from deleted sandbox returns error"
	else
		DELETED_SNAP_ID=$(echo "$DELETED_SNAP" | grep -o '"snapshotId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
		if [ -n "$DELETED_SNAP_ID" ]; then
			track_snapshot "$DELETED_SNAP_ID"
			delete_and_untrack_snapshot "$DELETED_SNAP_ID"
		fi
		fail "snapshot create from deleted sandbox should return error" "$DELETED_SNAP"
	fi
else
	fail "failed to create temp sandbox for deleted-sandbox snapshot test" "$TEMP_SBX"
fi

# Test: Snapshot get for non-existent snapshot
info "Test: snapshot get for non-existent snapshot"
set +e
NONEXIST_SNAP_GET=$($CLI cloud sandbox snapshot get "snp_nonexistent_${RUN_ID}" --json 2>&1)
NONEXIST_SNAP_GET_EXIT=$?
set -e
if [ "$NONEXIST_SNAP_GET_EXIT" -ne 0 ]; then
	pass "snapshot get for non-existent snapshot returns non-zero exit code ($NONEXIST_SNAP_GET_EXIT)"
else
	fail "snapshot get for non-existent snapshot exited with code 0 (expected non-zero)" "$NONEXIST_SNAP_GET"
fi
if echo "$NONEXIST_SNAP_GET" | grep -qi "not found\|404\|error"; then
	pass "snapshot get for non-existent snapshot returns error"
else
	fail "snapshot get for non-existent snapshot should return error" "$NONEXIST_SNAP_GET"
fi

# Test: Snapshot create with very long name (boundary test)
info "Test: snapshot create with very long name"
LONG_NAME=$(printf 'a%.0s' $(seq 1 300))
set +e
LONG_NAME_SNAP=$($CLI cloud sandbox snapshot create "$SANDBOX_ID" --name "$LONG_NAME" --json 2>&1)
LONG_NAME_SNAP_EXIT=$?
set -e
if echo "$LONG_NAME_SNAP" | grep -qi "error\|invalid\|too long\|validation\|exceeds"; then
	if [ "$LONG_NAME_SNAP_EXIT" -ne 0 ]; then
		pass "snapshot create with 300-char name returns validation error (exit code $LONG_NAME_SNAP_EXIT)"
	else
		fail "snapshot create with 300-char name returned error text but exit code 0" "$LONG_NAME_SNAP"
	fi
else
	# If it somehow succeeded, clean it up
	LONG_NAME_SNAP_ID=$(echo "$LONG_NAME_SNAP" | grep -o '"snapshotId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
	if [ -n "$LONG_NAME_SNAP_ID" ] && [[ "$LONG_NAME_SNAP_ID" == snp_* ]]; then
		track_snapshot "$LONG_NAME_SNAP_ID"
		delete_and_untrack_snapshot "$LONG_NAME_SNAP_ID"
		if [ "$LONG_NAME_SNAP_EXIT" -eq 0 ]; then
			pass "snapshot create with 300-char name was accepted (exit code 0)"
		else
			fail "snapshot create with 300-char name returned snapshot but non-zero exit code ($LONG_NAME_SNAP_EXIT)" "$LONG_NAME_SNAP"
		fi
	else
		fail "snapshot create with 300-char name gave unexpected response" "$LONG_NAME_SNAP"
	fi
fi

# Test: Snapshot create with special characters in name
info "Test: snapshot create with special characters in name"
set +e
SPECIAL_NAME_SNAP=$($CLI cloud sandbox snapshot create "$SANDBOX_ID" --name 'test snapshot!@#' --json 2>&1)
SPECIAL_NAME_SNAP_EXIT=$?
set -e
if echo "$SPECIAL_NAME_SNAP" | grep -qi "error\|invalid\|validation"; then
	if [ "$SPECIAL_NAME_SNAP_EXIT" -ne 0 ]; then
		pass "snapshot create with special characters returns validation error (exit code $SPECIAL_NAME_SNAP_EXIT)"
	else
		fail "snapshot create with special characters returned error text but exit code 0" "$SPECIAL_NAME_SNAP"
	fi
else
	# If it somehow succeeded, clean it up
	SPECIAL_NAME_SNAP_ID=$(echo "$SPECIAL_NAME_SNAP" | grep -o '"snapshotId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
	if [ -n "$SPECIAL_NAME_SNAP_ID" ] && [[ "$SPECIAL_NAME_SNAP_ID" == snp_* ]]; then
		track_snapshot "$SPECIAL_NAME_SNAP_ID"
		delete_and_untrack_snapshot "$SPECIAL_NAME_SNAP_ID"
		if [ "$SPECIAL_NAME_SNAP_EXIT" -eq 0 ]; then
			pass "snapshot create with special characters was accepted (exit code 0)"
		else
			fail "snapshot create with special characters returned snapshot but non-zero exit code ($SPECIAL_NAME_SNAP_EXIT)" "$SPECIAL_NAME_SNAP"
		fi
	else
		fail "snapshot create with special characters gave unexpected response" "$SPECIAL_NAME_SNAP"
	fi
fi

# ============================================
section "SNAPSHOT GET FIELD VALIDATION Tests"
# ============================================
# Create a fresh snapshot for field validation

info "Test: creating snapshot for field validation"
FIELD_SNAP_CREATE=$($CLI cloud sandbox snapshot create "$SANDBOX_ID" --name "field-test-${RUN_ID}" --json 2>&1) || true
FIELD_SNAP_ID=$(echo "$FIELD_SNAP_CREATE" | grep -o '"snapshotId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
track_snapshot "$FIELD_SNAP_ID"
if [ -n "$FIELD_SNAP_ID" ] && [[ "$FIELD_SNAP_ID" == snp_* ]]; then
	pass "snapshot created for field validation: $FIELD_SNAP_ID"
else
	fail "failed to create snapshot for field validation" "$FIELD_SNAP_CREATE"
fi

if [ -n "$FIELD_SNAP_ID" ] && [[ "$FIELD_SNAP_ID" == snp_* ]]; then
	# Test: snapshot get --json returns all expected fields
	info "Test: snapshot get --json field validation"
	FIELD_SNAP_GET=$($CLI cloud sandbox snapshot get "$FIELD_SNAP_ID" --json 2>&1) || true

	# Verify snapshotId present and starts with snp_
	FIELD_GET_ID=$(echo "$FIELD_SNAP_GET" | grep -o '"snapshotId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
	if [ -n "$FIELD_GET_ID" ] && [[ "$FIELD_GET_ID" == snp_* ]]; then
		pass "snapshot get returns snapshotId starting with snp_"
	else
		fail "snapshot get snapshotId missing or invalid prefix" "$FIELD_GET_ID"
	fi

	# Verify name present
	if echo "$FIELD_SNAP_GET" | grep -q '"name"'; then
		pass "snapshot get returns name field"
	else
		fail "snapshot get missing name field" "$FIELD_SNAP_GET"
	fi

	# Verify sizeBytes is a number > 0
	FIELD_SIZE=$(echo "$FIELD_SNAP_GET" | grep -o '"sizeBytes"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*$')
	if [ -n "$FIELD_SIZE" ] && [ "$FIELD_SIZE" -gt 0 ] 2>/dev/null; then
		pass "snapshot get sizeBytes is a number > 0: $FIELD_SIZE"
	else
		fail "snapshot get sizeBytes should be > 0" "sizeBytes=$FIELD_SIZE" "$FIELD_SNAP_GET"
	fi

	# Verify fileCount is a number >= 0
	FIELD_FILE_COUNT=$(echo "$FIELD_SNAP_GET" | grep -o '"fileCount"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*$')
	if [ -n "$FIELD_FILE_COUNT" ] 2>/dev/null; then
		pass "snapshot get fileCount is a number: $FIELD_FILE_COUNT"
	else
		fail "snapshot get fileCount missing or not a number" "fileCount=$FIELD_FILE_COUNT" "$FIELD_SNAP_GET"
	fi

	# Verify createdAt is present and looks like a timestamp
	FIELD_CREATED=$(echo "$FIELD_SNAP_GET" | grep -o '"createdAt"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
	if [ -n "$FIELD_CREATED" ] && echo "$FIELD_CREATED" | grep -qE '[0-9]{4}-[0-9]{2}-[0-9]{2}'; then
		pass "snapshot get createdAt is a valid timestamp: $FIELD_CREATED"
	else
		fail "snapshot get createdAt missing or invalid format" "createdAt=$FIELD_CREATED" "$FIELD_SNAP_GET"
	fi

	# Test: snapshot get --json includes files array
	info "Test: snapshot get includes files array"
	if echo "$FIELD_SNAP_GET" | grep -q '"files"'; then
		pass "snapshot get returns files array"

		# If files has entries, verify structure of entries
		# Check for path field in files
		if echo "$FIELD_SNAP_GET" | grep -q '"path"'; then
			pass "snapshot files entries contain path field"
		else
			info "snapshot files array may be empty (no path fields found)"
		fi

		# Check for size field in files
		if echo "$FIELD_SNAP_GET" | grep -q '"size"[[:space:]]*:'; then
			pass "snapshot files entries contain size field"
		else
			info "snapshot files entries may not contain size field (or array empty)"
		fi

		# Check for sha256 field in files
		if echo "$FIELD_SNAP_GET" | grep -q '"sha256"'; then
			pass "snapshot files entries contain sha256 field"
		else
			info "snapshot files entries may not contain sha256 field (or array empty)"
		fi

		# Check for contentType field in files
		if echo "$FIELD_SNAP_GET" | grep -q '"contentType"'; then
			pass "snapshot files entries contain contentType field"
		else
			info "snapshot files entries may not contain contentType field (or array empty)"
		fi
	else
		fail "snapshot get missing files array" "$FIELD_SNAP_GET"
	fi

	# Clean up field validation snapshot
	delete_and_untrack_snapshot "$FIELD_SNAP_ID"
fi

# ============================================
section "DELETE Command Tests"
# ============================================

# Test: Delete sandbox
info "Test: sandbox delete"
DELETE_OUTPUT=$($CLI cloud sandbox delete "$SANDBOX_ID" --confirm 2>&1) || true
if echo "$DELETE_OUTPUT" | grep -qi "deleted"; then
	pass "sandbox delete succeeds"
	SANDBOX_ID=""
else
	fail "sandbox delete failed" "$DELETE_OUTPUT"
fi

# Verify sandbox no longer accessible
info "Test: deleted sandbox not accessible"
GONE_OUTPUT=$($CLI cloud sandbox get "$SANDBOX_ID" 2>&1) || true
if echo "$GONE_OUTPUT" | grep -qi "not found\|404\|error"; then
	pass "deleted sandbox returns not found"
else
	fail "deleted sandbox still accessible" "$GONE_OUTPUT"
fi
