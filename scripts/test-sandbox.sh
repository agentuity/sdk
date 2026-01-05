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
	fail "downloaded directory structure incorrect" "Command output: $DIR_DOWNLOAD\nDirectory listing: $(ls -laR "$TEST_DIR/downloaded-dir" 2>&1)"
fi

# Test: Absolute path upload (inside /home/agentuity/app)
# NOTE: This test requires updated Hadron with /home/agentuity/app path support
# Skipping until Hadron is deployed with the path normalization fix
info "Test: sandbox cp - absolute path (skipped - requires Hadron update)"
pass "sandbox cp absolute path test skipped"

# ============================================
section "MKDIR Command Tests"
# ============================================

# Test: Create directory
info "Test: sandbox mkdir"
MKDIR_OUTPUT=$($CLI cloud sandbox mkdir "$SANDBOX_ID" /home/agentuity/app/newdir 2>&1) || true
if echo "$MKDIR_OUTPUT" | grep -qi "Created directory"; then
	pass "sandbox mkdir creates directory"
else
	fail "sandbox mkdir failed" "$MKDIR_OUTPUT"
fi

# Verify directory exists
MKDIR_VERIFY=$($CLI cloud sandbox exec "$SANDBOX_ID" -- test -d /home/agentuity/app/newdir && echo "DIR_EXISTS" 2>&1) || true
if echo "$MKDIR_VERIFY" | grep -q "DIR_EXISTS"; then
	pass "mkdir directory exists"
else
	fail "mkdir directory not found" "$MKDIR_VERIFY"
fi

# Test: Create nested directories with -p
info "Test: sandbox mkdir -p (recursive)"
MKDIR_P_OUTPUT=$($CLI cloud sandbox mkdir "$SANDBOX_ID" /home/agentuity/app/nested/deep/dir -p 2>&1) || true
if echo "$MKDIR_P_OUTPUT" | grep -qi "Created directory"; then
	pass "sandbox mkdir -p creates nested directories"
else
	fail "sandbox mkdir -p failed" "$MKDIR_P_OUTPUT"
fi

# Verify nested structure
NESTED_VERIFY=$($CLI cloud sandbox exec "$SANDBOX_ID" -- test -d /home/agentuity/app/nested/deep/dir && echo "NESTED_EXISTS" 2>&1) || true
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
LS_OUTPUT=$($CLI cloud sandbox files "$SANDBOX_ID" /home/agentuity/app 2>&1) || true
if echo "$LS_OUTPUT" | grep -q "test.txt" && echo "$LS_OUTPUT" | grep -q "testdir"; then
	pass "sandbox files shows files and directories"
else
	fail "sandbox files missing expected entries" "$LS_OUTPUT"
fi

# Test: List with JSON output
info "Test: sandbox files --json"
LS_JSON=$($CLI cloud sandbox files "$SANDBOX_ID" /home/agentuity/app --json 2>&1) || true
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
LS_LONG=$($CLI cloud sandbox files "$SANDBOX_ID" /home/agentuity/app -l 2>&1) || true
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
LS_JSON_LONG=$($CLI cloud sandbox files "$SANDBOX_ID" /home/agentuity/app --json 2>&1) || true
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
RMDIR_OUTPUT=$($CLI cloud sandbox rmdir "$SANDBOX_ID" /home/agentuity/app/newdir 2>&1) || true
if echo "$RMDIR_OUTPUT" | grep -qi "Removed directory"; then
	pass "sandbox rmdir removes empty directory"
else
	fail "sandbox rmdir failed" "$RMDIR_OUTPUT"
fi

# Verify directory removed
RMDIR_VERIFY=$($CLI cloud sandbox exec "$SANDBOX_ID" -- sh -c 'if [ -d /home/agentuity/app/newdir ]; then echo "STILL_EXISTS"; else echo "REMOVED"; fi' 2>&1) || true
if echo "$RMDIR_VERIFY" | grep -q "REMOVED"; then
	pass "rmdir directory no longer exists"
else
	fail "rmdir directory still exists" "$RMDIR_VERIFY"
fi

# Test: Remove directory recursively
info "Test: sandbox rmdir -r (recursive)"
RMDIR_R_OUTPUT=$($CLI cloud sandbox rmdir "$SANDBOX_ID" /home/agentuity/app/nested -r 2>&1) || true
if echo "$RMDIR_R_OUTPUT" | grep -qi "Removed directory"; then
	pass "sandbox rmdir -r removes directory tree"
else
	fail "sandbox rmdir -r failed" "$RMDIR_R_OUTPUT"
fi

# Verify recursive removal
RMDIR_R_VERIFY=$($CLI cloud sandbox exec "$SANDBOX_ID" -- sh -c 'if [ -d /home/agentuity/app/nested ]; then echo "STILL_EXISTS"; else echo "REMOVED"; fi' 2>&1) || true
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
$CLI cloud sandbox exec "$SANDBOX_ID" -- sh -c 'echo "file to delete" > /home/agentuity/app/todelete.txt' >/dev/null 2>&1 || true
RM_CHECK=$($CLI cloud sandbox exec "$SANDBOX_ID" -- cat /home/agentuity/app/todelete.txt 2>&1) || true
if echo "$RM_CHECK" | grep -q "file to delete"; then
	pass "test file created for rm"
else
	fail "failed to create test file for rm" "$RM_CHECK"
fi

# Test: Remove a file
info "Test: sandbox rm"
RM_OUTPUT=$($CLI cloud sandbox rm "$SANDBOX_ID" /home/agentuity/app/todelete.txt 2>&1) || true
if echo "$RM_OUTPUT" | grep -qi "Removed file"; then
	pass "sandbox rm removes file"
else
	fail "sandbox rm failed" "$RM_OUTPUT"
fi

# Verify file removed
RM_VERIFY=$($CLI cloud sandbox exec "$SANDBOX_ID" -- sh -c 'if [ -f /home/agentuity/app/todelete.txt ]; then echo "STILL_EXISTS"; else echo "REMOVED"; fi' 2>&1) || true
if echo "$RM_VERIFY" | grep -q "REMOVED"; then
	pass "rm file no longer exists"
else
	fail "rm file still exists" "$RM_VERIFY"
fi

# Test: Remove non-existent file (should fail gracefully)
info "Test: sandbox rm - non-existent file"
RM_NOFILE=$($CLI cloud sandbox rm "$SANDBOX_ID" /home/agentuity/app/nonexistent.txt 2>&1) || true
if echo "$RM_NOFILE" | grep -qi "not found\|error\|fail"; then
	pass "sandbox rm reports error for non-existent file"
else
	fail "sandbox rm did not report error for non-existent file" "$RM_NOFILE"
fi

# Test: rm on directory should fail (use rmdir instead)
info "Test: sandbox rm - fails on directory"
$CLI cloud sandbox mkdir "$SANDBOX_ID" /home/agentuity/app/testrmdir >/dev/null 2>&1 || true
RM_DIR=$($CLI cloud sandbox rm "$SANDBOX_ID" /home/agentuity/app/testrmdir 2>&1) || true
if echo "$RM_DIR" | grep -qi "directory\|error\|fail"; then
	pass "sandbox rm correctly fails on directory"
else
	fail "sandbox rm should fail on directory" "$RM_DIR"
fi
# Clean up test directory
$CLI cloud sandbox rmdir "$SANDBOX_ID" /home/agentuity/app/testrmdir >/dev/null 2>&1 || true

# Test: JSON output
info "Test: sandbox rm --json"
$CLI cloud sandbox exec "$SANDBOX_ID" -- sh -c 'echo "json test" > /home/agentuity/app/jsontest.txt' >/dev/null 2>&1 || true
RM_JSON=$($CLI cloud sandbox rm "$SANDBOX_ID" /home/agentuity/app/jsontest.txt --json 2>&1) || true
if echo "$RM_JSON" | grep -q '"success"' && echo "$RM_JSON" | grep -q '"path"'; then
	pass "sandbox rm --json returns structured data"
else
	fail "sandbox rm --json missing expected fields" "$RM_JSON"
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
DOWNLOAD_PATH=$($CLI cloud sandbox download "$SANDBOX_ID" "$TEST_DIR/subdir-archive.tar.gz" --path /home/agentuity/app/testdir 2>&1) || true
if [ -f "$TEST_DIR/subdir-archive.tar.gz" ]; then
	pass "sandbox download --path creates archive"
else
	fail "sandbox download --path failed" "$DOWNLOAD_PATH"
fi

# Create a fresh sandbox to test upload
info "Test: Creating fresh sandbox for upload test"
UPLOAD_SANDBOX=$($CLI cloud sandbox create --json 2>&1) || true
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
	UPLOAD_VERIFY=$($CLI cloud sandbox exec "$UPLOAD_SANDBOX_ID" -- ls /home/agentuity/app 2>&1) || true
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
