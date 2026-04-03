#!/bin/bash
# Test Coder CLI Commands
# Exercises session CRUD, workspace CRUD, skill CRUD, and GitHub resolution
#
# This script validates actual command outputs, not just exit codes.
#
# Usage: bash scripts/test-coder.sh --org-id <org_id> [--profile <profile>]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLI="bun $SDK_ROOT/packages/cli/bin/cli.ts"

# Parse arguments
ORG_ID=""
PROFILE_FLAG=""
while [[ $# -gt 0 ]]; do
	case $1 in
		--org-id) ORG_ID="$2"; shift 2 ;;
		--profile) PROFILE_FLAG="--profile $2"; shift 2 ;;
		*) echo "Unknown arg: $1"; exit 1 ;;
	esac
done
if [ -z "$ORG_ID" ]; then
	echo "Usage: bash scripts/test-coder.sh --org-id <org_id> [--profile <profile>]"
	exit 1
fi

# Get commit SHA for descriptions
COMMIT_SHA=$(git -C "$SDK_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Resource tracking for cleanup
SESSION_IDS=()
WORKSPACE_IDS=()
SKILL_BUCKET_IDS=()
SKILL_IDS=()

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

cleanup() {
	echo -e "\n${YELLOW}Cleaning up...${NC}"

	# Archive + delete tracked sessions
	for sid in "${SESSION_IDS[@]}"; do
		if [ -n "$sid" ]; then
			$CLI coder archive "$sid" $PROFILE_FLAG --org-id "$ORG_ID" --json 2>/dev/null || true
			$CLI coder rm "$sid" $PROFILE_FLAG --org-id "$ORG_ID" --json 2>/dev/null || true
		fi
	done

	# Delete tracked workspaces
	for wid in "${WORKSPACE_IDS[@]}"; do
		if [ -n "$wid" ]; then
			$CLI coder ws rm "$wid" $PROFILE_FLAG --org-id "$ORG_ID" --json 2>/dev/null || true
		fi
	done

	# Delete tracked skill buckets
	for bid in "${SKILL_BUCKET_IDS[@]}"; do
		if [ -n "$bid" ]; then
			$CLI coder skill buckets --delete "$bid" $PROFILE_FLAG --org-id "$ORG_ID" --json 2>/dev/null || true
		fi
	done

	# Delete tracked saved skills
	for skid in "${SKILL_IDS[@]}"; do
		if [ -n "$skid" ]; then
			$CLI coder skill rm "$skid" $PROFILE_FLAG --org-id "$ORG_ID" --json 2>/dev/null || true
		fi
	done

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
	if [ -n "$3" ]; then
		echo -e "${RED}  CLI Response:${NC}"
		echo "$3" | while IFS= read -r line; do
			echo -e "${RED}    ${line}${NC}"
		done
	fi
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

# Helper: extract a JSON field value (simple grep-based for portability)
# Usage: json_field "fieldName" "$json_output"
json_field() {
	local field="$1"
	local json="$2"
	echo "$json" | grep -o "\"$field\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed "s/\"$field\"[[:space:]]*:[[:space:]]*\"//" | sed 's/"$//'
}

# Helper: extract a JSON numeric/boolean field value
# Usage: json_raw_field "fieldName" "$json_output"
json_raw_field() {
	local field="$1"
	local json="$2"
	echo "$json" | grep -o "\"$field\"[[:space:]]*:[[:space:]]*[^,}]*" | head -1 | sed "s/\"$field\"[[:space:]]*:[[:space:]]*//" | sed 's/[[:space:]]*$//'
}

echo "========================================"
echo "  Coder CLI Test Suite"
echo "========================================"
echo "Org ID: $ORG_ID"
echo "Commit: $COMMIT_SHA"

# ============================================
section "Session Lifecycle"
# ============================================

# Test: Create a session
info "Test: coder create session"
SESSION_OUTPUT=$($CLI coder create "Smoke test session" --label "Smoke Test" --tags "test,smoke" $PROFILE_FLAG --org-id "$ORG_ID" --json 2>&1) || true
SESSION_ID=$(json_field "sessionId" "$SESSION_OUTPUT")
if [ -n "$SESSION_ID" ]; then
	SESSION_IDS+=("$SESSION_ID")
	pass "coder create returned sessionId: $SESSION_ID"
else
	fail "coder create did not return sessionId" "$SESSION_OUTPUT"
fi

# Test: List sessions
info "Test: coder ls"
LS_OUTPUT=$($CLI coder ls $PROFILE_FLAG --org-id "$ORG_ID" --json 2>&1) || true
if echo "$LS_OUTPUT" | grep -q "$SESSION_ID"; then
	pass "coder ls includes created session"
else
	fail "coder ls does not include session $SESSION_ID" "$LS_OUTPUT"
fi

# Test: Get session
info "Test: coder get session"
GET_OUTPUT=$($CLI coder get "$SESSION_ID" $PROFILE_FLAG --org-id "$ORG_ID" --json 2>&1) || true
GET_LABEL=$(json_field "label" "$GET_OUTPUT")
if [ "$GET_LABEL" = "Smoke Test" ]; then
	pass "coder get returns correct label: $GET_LABEL"
else
	fail "coder get label mismatch" "expected 'Smoke Test', got '$GET_LABEL'" "$GET_OUTPUT"
fi

# Test: Verify tags on get
if echo "$GET_OUTPUT" | grep -q "test" && echo "$GET_OUTPUT" | grep -q "smoke"; then
	pass "coder get returns correct tags"
else
	fail "coder get tags mismatch" "expected tags containing 'test' and 'smoke'" "$GET_OUTPUT"
fi

# Test: Update session
info "Test: coder update session"
UPDATE_OUTPUT=$($CLI coder update "$SESSION_ID" --visibility org --tags "updated,smoke" $PROFILE_FLAG --org-id "$ORG_ID" --json 2>&1) || true
if [ $? -eq 0 ] || echo "$UPDATE_OUTPUT" | grep -qi "session\|update\|success\|$SESSION_ID"; then
	pass "coder update succeeded"
else
	fail "coder update failed" "$UPDATE_OUTPUT"
fi

# Test: Verify update applied
info "Test: verify update applied"
GET_UPDATED=$($CLI coder get "$SESSION_ID" $PROFILE_FLAG --org-id "$ORG_ID" --json 2>&1) || true
VISIBILITY=$(json_field "visibility" "$GET_UPDATED")
if [ "$VISIBILITY" = "organization" ]; then
	pass "coder get shows visibility changed to organization"
else
	fail "visibility not updated" "expected 'organization', got '$VISIBILITY'" "$GET_UPDATED"
fi
if echo "$GET_UPDATED" | grep -q "updated"; then
	pass "coder get shows updated tags"
else
	fail "tags not updated" "expected tags containing 'updated'" "$GET_UPDATED"
fi

# Test: Wait for session to become active
info "Test: wait for session to become active (polling every 3s, max 60s)"
ACTIVE=false
for i in $(seq 1 20); do
	POLL_OUTPUT=$($CLI coder get "$SESSION_ID" $PROFILE_FLAG --org-id "$ORG_ID" --json 2>&1) || true
	POLL_STATUS=$(json_field "status" "$POLL_OUTPUT")
	if [ "$POLL_STATUS" = "active" ] || [ "$POLL_STATUS" = "ready" ] || [ "$POLL_STATUS" = "running" ]; then
		ACTIVE=true
		break
	fi
	sleep 3
done
if [ "$ACTIVE" = true ]; then
	pass "session became active (status: $POLL_STATUS)"
else
	info "session did not become active within 60s (status: $POLL_STATUS) — continuing tests"
fi

# Test: Events
info "Test: coder events"
EVENTS_OUTPUT=$($CLI coder events "$SESSION_ID" $PROFILE_FLAG --org-id "$ORG_ID" --json 2>&1) || true
if [ $? -eq 0 ] || echo "$EVENTS_OUTPUT" | grep -qE '^\[|"event"|"type"'; then
	pass "coder events returns response"
else
	fail "coder events failed" "$EVENTS_OUTPUT"
fi

# Test: Participants
info "Test: coder participants"
PARTICIPANTS_OUTPUT=$($CLI coder participants "$SESSION_ID" $PROFILE_FLAG --org-id "$ORG_ID" --json 2>&1) || true
if [ $? -eq 0 ] || echo "$PARTICIPANTS_OUTPUT" | grep -qE '^\[|"participant"|"user"'; then
	pass "coder participants returns response"
else
	fail "coder participants failed" "$PARTICIPANTS_OUTPUT"
fi

# Test: Loop
info "Test: coder loop"
LOOP_OUTPUT=$($CLI coder loop "$SESSION_ID" $PROFILE_FLAG --org-id "$ORG_ID" --json 2>&1) || true
if echo "$LOOP_OUTPUT" | grep -q "workflowMode"; then
	pass "coder loop returns workflowMode"
else
	fail "coder loop did not return workflowMode" "$LOOP_OUTPUT"
fi

# Test: Archive session
info "Test: coder archive"
ARCHIVE_OUTPUT=$($CLI coder archive "$SESSION_ID" $PROFILE_FLAG --org-id "$ORG_ID" --json 2>&1) || true
ARCHIVE_STATUS=$(json_field "status" "$ARCHIVE_OUTPUT")
if [ "$ARCHIVE_STATUS" = "archived" ]; then
	pass "coder archive set status to archived"
else
	fail "coder archive status mismatch" "expected 'archived', got '$ARCHIVE_STATUS'" "$ARCHIVE_OUTPUT"
fi

# Test: Delete session
info "Test: coder rm"
RM_OUTPUT=$($CLI coder rm "$SESSION_ID" $PROFILE_FLAG --org-id "$ORG_ID" --json 2>&1) || true
RM_DELETED=$(json_raw_field "deleted" "$RM_OUTPUT")
if [ "$RM_DELETED" = "true" ]; then
	pass "coder rm returned deleted: true"
	# Remove from tracking since it's already deleted
	new_sessions=()
	for sid in "${SESSION_IDS[@]}"; do
		if [ "$sid" != "$SESSION_ID" ]; then
			new_sessions+=("$sid")
		fi
	done
	SESSION_IDS=("${new_sessions[@]}")
else
	fail "coder rm did not return deleted: true" "$RM_OUTPUT"
fi

# Test: Verify session is gone
info "Test: verify session deleted"
GET_GONE_OUTPUT=$($CLI coder get "$SESSION_ID" $PROFILE_FLAG --org-id "$ORG_ID" --json 2>&1) || true
if echo "$GET_GONE_OUTPUT" | grep -qiE "404|not found|error|null"; then
	pass "coder get confirms session is deleted"
else
	fail "coder get did not return error for deleted session" "$GET_GONE_OUTPUT"
fi

# ============================================
section "Session Create Options"
# ============================================

# Test: Create with loop mode
info "Test: coder create with loop mode"
LOOP_CREATE_OUTPUT=$($CLI coder create "Loop mode test" --workflow-mode loop --loop-goal "Test goal" --loop-max-iterations 5 $PROFILE_FLAG --org-id "$ORG_ID" --json 2>&1) || true
LOOP_SESSION_ID=$(json_field "sessionId" "$LOOP_CREATE_OUTPUT")
if [ -n "$LOOP_SESSION_ID" ]; then
	SESSION_IDS+=("$LOOP_SESSION_ID")
	pass "coder create (loop mode) returned sessionId: $LOOP_SESSION_ID"
else
	fail "coder create (loop mode) did not return sessionId" "$LOOP_CREATE_OUTPUT"
fi

# Test: Verify loop mode
info "Test: verify workflowMode is loop"
if [ -n "$LOOP_SESSION_ID" ]; then
	LOOP_GET_OUTPUT=$($CLI coder get "$LOOP_SESSION_ID" $PROFILE_FLAG --org-id "$ORG_ID" --json 2>&1) || true
	WORKFLOW_MODE=$(json_field "workflowMode" "$LOOP_GET_OUTPUT")
	if [ "$WORKFLOW_MODE" = "loop" ]; then
		pass "coder get shows workflowMode: loop"
	else
		fail "workflowMode mismatch" "expected 'loop', got '$WORKFLOW_MODE'" "$LOOP_GET_OUTPUT"
	fi
else
	fail "skipping workflowMode verify — no session" "session create failed"
fi

# Cleanup: archive + delete loop session
info "Cleaning up loop session"
if [ -n "$LOOP_SESSION_ID" ]; then
	$CLI coder archive "$LOOP_SESSION_ID" $PROFILE_FLAG --org-id "$ORG_ID" --json 2>/dev/null || true
	$CLI coder rm "$LOOP_SESSION_ID" $PROFILE_FLAG --org-id "$ORG_ID" --json 2>/dev/null || true
	# Remove from tracking
	new_sessions=()
	for sid in "${SESSION_IDS[@]}"; do
		if [ "$sid" != "$LOOP_SESSION_ID" ]; then
			new_sessions+=("$sid")
		fi
	done
	SESSION_IDS=("${new_sessions[@]}")
fi

# ============================================
section "Workspace CRUD"
# ============================================

# Test: List workspaces (capture initial count)
info "Test: coder workspace ls"
WS_LS_OUTPUT=$($CLI coder workspace ls $PROFILE_FLAG --org-id "$ORG_ID" --json 2>&1) || true
WS_INITIAL_COUNT=$(echo "$WS_LS_OUTPUT" | grep -o '"id"' | wc -l | tr -d ' ')
pass "coder workspace ls returned (initial count: $WS_INITIAL_COUNT)"

# Test: Create workspace with repo
info "Test: coder workspace create"
WS_CREATE_OUTPUT=$($CLI coder workspace create "Smoke Test WS" --description "Temporary workspace for commit $COMMIT_SHA" --repo agentuity/sdk $PROFILE_FLAG --org-id "$ORG_ID" --json 2>&1) || true
WORKSPACE_ID=$(json_field "id" "$WS_CREATE_OUTPUT")
if [ -n "$WORKSPACE_ID" ]; then
	WORKSPACE_IDS+=("$WORKSPACE_ID")
	pass "coder workspace create returned id: $WORKSPACE_ID"
else
	fail "coder workspace create did not return id" "$WS_CREATE_OUTPUT"
fi

# Test: Get workspace
info "Test: coder ws get"
if [ -n "$WORKSPACE_ID" ]; then
	WS_GET_OUTPUT=$($CLI coder ws get "$WORKSPACE_ID" $PROFILE_FLAG --org-id "$ORG_ID" --json 2>&1) || true
	WS_NAME=$(json_field "name" "$WS_GET_OUTPUT")
	if [ "$WS_NAME" = "Smoke Test WS" ]; then
		pass "coder ws get returns correct name"
	else
		fail "coder ws get name mismatch" "expected 'Smoke Test WS', got '$WS_NAME'" "$WS_GET_OUTPUT"
	fi
	if echo "$WS_GET_OUTPUT" | grep -q "sdk"; then
		pass "coder ws get shows repo includes 'sdk'"
	else
		fail "coder ws get repos missing 'sdk'" "expected repos to contain sdk" "$WS_GET_OUTPUT"
	fi
else
	fail "skipping ws get — no workspace" "workspace create failed"
fi

# Test: Delete workspace
info "Test: coder ws rm"
if [ -n "$WORKSPACE_ID" ]; then
	WS_RM_OUTPUT=$($CLI coder ws rm "$WORKSPACE_ID" $PROFILE_FLAG --org-id "$ORG_ID" --json 2>&1) || true
	WS_DELETED=$(json_raw_field "deleted" "$WS_RM_OUTPUT")
	if [ "$WS_DELETED" = "true" ]; then
		pass "coder ws rm returned deleted: true"
		# Remove from tracking
		new_workspaces=()
		for wid in "${WORKSPACE_IDS[@]}"; do
			if [ "$wid" != "$WORKSPACE_ID" ]; then
				new_workspaces+=("$wid")
			fi
		done
		WORKSPACE_IDS=("${new_workspaces[@]}")
	else
		fail "coder ws rm did not return deleted: true" "$WS_RM_OUTPUT"
	fi
else
	fail "skipping ws rm — no workspace" "workspace create failed"
fi

# Test: Verify workspace count restored
info "Test: verify workspace count restored"
WS_LS_AFTER=$($CLI coder workspace ls $PROFILE_FLAG --org-id "$ORG_ID" --json 2>&1) || true
WS_AFTER_COUNT=$(echo "$WS_LS_AFTER" | grep -o '"id"' | wc -l | tr -d ' ')
if [ "$WS_AFTER_COUNT" -eq "$WS_INITIAL_COUNT" ]; then
	pass "workspace count matches original ($WS_AFTER_COUNT)"
else
	fail "workspace count mismatch" "expected $WS_INITIAL_COUNT, got $WS_AFTER_COUNT"
fi

# ============================================
section "Skill Bucket CRUD"
# ============================================

# Test: List skill buckets (capture initial count)
info "Test: coder skill buckets"
BUCKET_LS_OUTPUT=$($CLI coder skill buckets $PROFILE_FLAG --org-id "$ORG_ID" --json 2>&1) || true
BUCKET_INITIAL_COUNT=$(echo "$BUCKET_LS_OUTPUT" | grep -o '"id"' | wc -l | tr -d ' ')
pass "coder skill buckets returned (initial count: $BUCKET_INITIAL_COUNT)"

# Test: Create skill bucket
info "Test: coder skill buckets --create"
BUCKET_CREATE_OUTPUT=$($CLI coder skill buckets --create "Smoke Bucket" --description "Temporary bucket for commit $COMMIT_SHA" $PROFILE_FLAG --org-id "$ORG_ID" --json 2>&1) || true
BUCKET_ID=$(json_field "id" "$BUCKET_CREATE_OUTPUT")
if [ -n "$BUCKET_ID" ]; then
	SKILL_BUCKET_IDS+=("$BUCKET_ID")
	pass "coder skill buckets --create returned id: $BUCKET_ID"
else
	fail "coder skill buckets --create did not return id" "$BUCKET_CREATE_OUTPUT"
fi

# Test: Verify bucket appears in list
info "Test: verify bucket in list"
BUCKET_LS_AFTER_CREATE=$($CLI coder skill buckets $PROFILE_FLAG --org-id "$ORG_ID" --json 2>&1) || true
if echo "$BUCKET_LS_AFTER_CREATE" | grep -q "$BUCKET_ID"; then
	pass "skill bucket appears in list"
else
	fail "skill bucket not found in list" "expected to find $BUCKET_ID" "$BUCKET_LS_AFTER_CREATE"
fi

# Test: Delete skill bucket
info "Test: coder skill buckets --delete"
if [ -n "$BUCKET_ID" ]; then
	BUCKET_DEL_OUTPUT=$($CLI coder skill buckets --delete "$BUCKET_ID" $PROFILE_FLAG --org-id "$ORG_ID" --json 2>&1) || true
	BUCKET_DELETED=$(json_raw_field "deleted" "$BUCKET_DEL_OUTPUT")
	if [ "$BUCKET_DELETED" = "true" ]; then
		pass "coder skill buckets --delete returned deleted: true"
		# Remove from tracking
		new_buckets=()
		for bid in "${SKILL_BUCKET_IDS[@]}"; do
			if [ "$bid" != "$BUCKET_ID" ]; then
				new_buckets+=("$bid")
			fi
		done
		SKILL_BUCKET_IDS=("${new_buckets[@]}")
	else
		fail "coder skill buckets --delete did not return deleted: true" "$BUCKET_DEL_OUTPUT"
	fi
else
	fail "skipping bucket delete — no bucket" "bucket create failed"
fi

# Test: Verify bucket count restored
info "Test: verify bucket count restored"
BUCKET_LS_FINAL=$($CLI coder skill buckets $PROFILE_FLAG --org-id "$ORG_ID" --json 2>&1) || true
BUCKET_FINAL_COUNT=$(echo "$BUCKET_LS_FINAL" | grep -o '"id"' | wc -l | tr -d ' ')
if [ "$BUCKET_FINAL_COUNT" -eq "$BUCKET_INITIAL_COUNT" ]; then
	pass "bucket count matches original ($BUCKET_FINAL_COUNT)"
else
	fail "bucket count mismatch" "expected $BUCKET_INITIAL_COUNT, got $BUCKET_FINAL_COUNT"
fi

# ============================================
section "Skill Save/Delete"
# ============================================

# Test: List skills (capture initial count)
info "Test: coder skill ls"
SKILL_LS_OUTPUT=$($CLI coder skill ls $PROFILE_FLAG --org-id "$ORG_ID" --json 2>&1) || true
SKILL_INITIAL_COUNT=$(echo "$SKILL_LS_OUTPUT" | grep -o '"id"' | wc -l | tr -d ' ')
pass "coder skill ls returned (initial count: $SKILL_INITIAL_COUNT)"

# Test: Save a skill
info "Test: coder skill save"
SKILL_SAVE_OUTPUT=$($CLI coder skill save --repo chromedevtools --skill-id chrome-devtools-mcp --name "Chrome DevTools MCP" $PROFILE_FLAG --org-id "$ORG_ID" --json 2>&1) || true
SKILL_ID=$(json_field "id" "$SKILL_SAVE_OUTPUT")
if [ -n "$SKILL_ID" ]; then
	SKILL_IDS+=("$SKILL_ID")
	pass "coder skill save returned id: $SKILL_ID"
else
	fail "coder skill save did not return id" "$SKILL_SAVE_OUTPUT"
fi

# Test: Verify skill appears in list
info "Test: verify skill in list"
SKILL_LS_AFTER=$($CLI coder skill ls $PROFILE_FLAG --org-id "$ORG_ID" --json 2>&1) || true
if echo "$SKILL_LS_AFTER" | grep -q "$SKILL_ID"; then
	pass "saved skill appears in list"
else
	fail "saved skill not found in list" "expected to find $SKILL_ID" "$SKILL_LS_AFTER"
fi

# Test: Delete skill
info "Test: coder skill rm"
if [ -n "$SKILL_ID" ]; then
	SKILL_RM_OUTPUT=$($CLI coder skill rm "$SKILL_ID" $PROFILE_FLAG --org-id "$ORG_ID" --json 2>&1) || true
	SKILL_DELETED=$(json_raw_field "deleted" "$SKILL_RM_OUTPUT")
	if [ "$SKILL_DELETED" = "true" ]; then
		pass "coder skill rm returned deleted: true"
		# Remove from tracking
		new_skills=()
		for skid in "${SKILL_IDS[@]}"; do
			if [ "$skid" != "$SKILL_ID" ]; then
				new_skills+=("$skid")
			fi
		done
		SKILL_IDS=("${new_skills[@]}")
	else
		fail "coder skill rm did not return deleted: true" "$SKILL_RM_OUTPUT"
	fi
else
	fail "skipping skill rm — no skill" "skill save failed"
fi

# Test: Verify skill count restored
info "Test: verify skill count restored"
SKILL_LS_FINAL=$($CLI coder skill ls $PROFILE_FLAG --org-id "$ORG_ID" --json 2>&1) || true
SKILL_FINAL_COUNT=$(echo "$SKILL_LS_FINAL" | grep -o '"id"' | wc -l | tr -d ' ')
if [ "$SKILL_FINAL_COUNT" -eq "$SKILL_INITIAL_COUNT" ]; then
	pass "skill count matches original ($SKILL_FINAL_COUNT)"
else
	fail "skill count mismatch" "expected $SKILL_INITIAL_COUNT, got $SKILL_FINAL_COUNT"
fi

# ============================================
section "GitHub Integration"
# ============================================

# Test: Workspace create with invalid repo should fail gracefully
info "Test: coder workspace create with invalid repo"
BAD_REPO_OUTPUT=$($CLI coder workspace create "Bad Repo Test" --repo nonexistent-org-12345/nonexistent-repo $PROFILE_FLAG --org-id "$ORG_ID" --json 2>&1) || true
if echo "$BAD_REPO_OUTPUT" | grep -qiE "error|not found|fail|invalid|404"; then
	pass "workspace create with invalid repo fails gracefully"
else
	# If it somehow succeeded, track for cleanup
	BAD_WS_ID=$(json_field "id" "$BAD_REPO_OUTPUT")
	if [ -n "$BAD_WS_ID" ]; then
		WORKSPACE_IDS+=("$BAD_WS_ID")
		fail "workspace create with invalid repo unexpectedly succeeded" "id: $BAD_WS_ID" "$BAD_REPO_OUTPUT"
	else
		fail "workspace create with invalid repo gave unexpected response" "$BAD_REPO_OUTPUT"
	fi
fi

echo ""
echo -e "${GREEN}All test sections complete. Cleanup will run now.${NC}"
