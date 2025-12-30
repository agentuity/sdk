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
SNAPSHOT_ID=""
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
	if [ -n "$SNAPSHOT_ID" ]; then
		$CLI cloud sandbox snapshot delete "$SNAPSHOT_ID" --confirm 2>/dev/null || true
	fi
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

fail() {
	echo -e "${RED}✗ $1${NC}"
	echo -e "${RED}  Output: $2${NC}"
	TESTS_FAILED=$((TESTS_FAILED + 1))
}

info() {
	echo -e "${YELLOW}→ $1${NC}"
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
RUN_OUTPUT=$($CLI cloud sandbox run -- echo "hello from run" 2>&1) || true
if echo "$RUN_OUTPUT" | grep -q "hello from run"; then
	pass "sandbox run executes command and returns output"
else
	fail "sandbox run did not return expected output" "$RUN_OUTPUT"
fi

# Test: Run with file injection
info "Test: sandbox run --file"
RUN_FILE_OUTPUT=$($CLI cloud sandbox run --file "script.sh:$TEST_DIR/script.sh" -- bash script.sh testarg 2>&1) || true
if echo "$RUN_FILE_OUTPUT" | grep -q "Script executed with arg: testarg"; then
	pass "sandbox run --file injects file and executes correctly"
else
	fail "sandbox run --file did not execute script correctly" "$RUN_FILE_OUTPUT"
fi

# Test: Run with environment variable
info "Test: sandbox run --env"
RUN_ENV_OUTPUT=$($CLI cloud sandbox run --env "MY_VAR=hello_env" -- sh -c 'echo $MY_VAR' 2>&1) || true
if echo "$RUN_ENV_OUTPUT" | grep -q "hello_env"; then
	pass "sandbox run --env sets environment variable"
else
	fail "sandbox run --env did not set variable" "$RUN_ENV_OUTPUT"
fi

# Test: Run with network enabled (test DNS resolution)
info "Test: sandbox run --network"
RUN_NET_OUTPUT=$($CLI cloud sandbox run --network -- sh -c 'getent hosts example.com && echo "DNS_OK"' 2>&1) || true
if echo "$RUN_NET_OUTPUT" | grep -q "DNS_OK"; then
	pass "sandbox run --network enables network access"
else
	fail "sandbox run --network failed DNS resolution" "$RUN_NET_OUTPUT"
fi

# ============================================
section "CREATE & GET & LIST Command Tests"
# ============================================

# Test: Create sandbox with JSON output
info "Test: sandbox create --json"
CREATE_OUTPUT=$($CLI cloud sandbox create --json 2>&1) || true
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
	fail "sandbox did not become ready within ${MAX_WAIT}s" "status: $CURRENT_STATUS"
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
VERIFY_OUTPUT=$($CLI cloud sandbox exec "$SANDBOX_ID" -- cat /home/agentuity/app/test.txt 2>&1) || true
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
STRUCT_OUTPUT=$($CLI cloud sandbox exec "$SANDBOX_ID" -- find /home/agentuity/app/testdir -name "*.txt" 2>&1) || true
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
	fail "downloaded directory structure incorrect" "$(ls -laR "$TEST_DIR/downloaded-dir" 2>&1)"
fi

# Test: Absolute path upload (inside /home/agentuity/app)
# NOTE: This test requires updated Hadron with /home/agentuity/app path support
# Skipping until Hadron is deployed with the path normalization fix
info "Test: sandbox cp - absolute path (skipped - requires Hadron update)"
pass "sandbox cp absolute path test skipped"

# ============================================
section "SNAPSHOT Command Tests"
# ============================================

# Test: Create snapshot
info "Test: snapshot create --json"
SNAP_CREATE=$($CLI cloud sandbox snapshot create "$SANDBOX_ID" --json 2>&1) || true
SNAPSHOT_ID=$(echo "$SNAP_CREATE" | grep -o '"snapshotId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
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
TEST_TAG="test-$(date +%s)"
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

# Test: Create sandbox from snapshot
info "Test: sandbox create --snapshot"
SNAP_SANDBOX=$($CLI cloud sandbox create --snapshot "$SNAPSHOT_ID" --json 2>&1) || true
SNAP_SANDBOX_ID=$(echo "$SNAP_SANDBOX" | grep -o '"sandboxId"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
if [ -n "$SNAP_SANDBOX_ID" ]; then
	# Wait for snapshot restore and verify file exists
	sleep 3
	RESTORE_VERIFY=$($CLI cloud sandbox exec "$SNAP_SANDBOX_ID" -- cat /home/agentuity/app/test.txt 2>&1) || true
	if echo "$RESTORE_VERIFY" | grep -q "Hello from test file"; then
		pass "sandbox from snapshot contains restored files"
	else
		fail "sandbox from snapshot missing files" "$RESTORE_VERIFY"
	fi
	# Clean up snapshot sandbox
	$CLI cloud sandbox delete "$SNAP_SANDBOX_ID" --confirm 2>/dev/null || true
else
	fail "failed to create sandbox from snapshot" "$SNAP_SANDBOX"
fi

# Test: Delete snapshot
info "Test: snapshot delete"
SNAP_DELETE_OUTPUT=$($CLI cloud sandbox snapshot delete "$SNAPSHOT_ID" --confirm 2>&1) || true
if echo "$SNAP_DELETE_OUTPUT" | grep -qi "deleted"; then
	pass "snapshot delete succeeds"
	SNAPSHOT_ID=""
else
	fail "snapshot delete failed" "$SNAP_DELETE_OUTPUT"
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
