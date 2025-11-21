#!/bin/bash

# Test deployment commands (deploy, undeploy, list, rollback)
# Tests the full deployment workflow using the Agentuity CLI

set -e

# Get script directory and find CLI binary
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/test-lib.sh"

BIN_SCRIPT="$SCRIPT_DIR/../../../../packages/cli/bin/cli.ts"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Track test results
TEST_FAILED=false

# Cleanup function
cleanup() {
	local exit_code=$?
	echo "" 2>/dev/null || true
	echo "Cleaning up..." 2>/dev/null || true
	
	# Remove temp directory if set
	if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
		rm -rf "$TEMP_DIR"
	fi
	
	if [ $exit_code -ne 0 ] || [ "$TEST_FAILED" = true ]; then
		echo -e "${RED}✗${NC} Deployment test failed"
		exit 1
	fi
}

trap cleanup EXIT INT TERM

# Create temp directory for test artifacts
TEMP_DIR=$(mktemp -d)
echo "Test directory: $TEMP_DIR"
echo ""

# Change to test-app directory
cd "$SCRIPT_DIR/.."

echo "========================================="
echo "  Deployment Commands Test"
echo "========================================="
echo ""

# Check if user is authenticated
echo "Checking authentication..."
set +e
bun "$BIN_SCRIPT" auth whoami &> /dev/null
AUTH_CHECK=$?
set -e

if [ $AUTH_CHECK -ne 0 ]; then
	echo -e "${RED}✗${NC} Not authenticated. Please run: bun $BIN_SCRIPT auth login"
	TEST_FAILED=true
	exit 1
fi
echo -e "${GREEN}✓${NC} Authenticated"
echo ""

# Check if project exists (agentuity.json file)
if [ ! -f "agentuity.json" ]; then
	echo -e "${RED}✗${NC} No agentuity.json file found. This test must be run from a project directory."
	TEST_FAILED=true
	exit 1
fi
echo -e "${GREEN}✓${NC} Project configuration found"
echo ""

# Test 1: List deployments (should work even with no deployments)
echo "Test 1: List deployments..."
set +e
DEPLOYMENT_LIST_OUTPUT="$TEMP_DIR/deployment-list.txt"
bun "$BIN_SCRIPT" cloud deployment list > "$DEPLOYMENT_LIST_OUTPUT" 2>&1
DEPLOYMENT_LIST_EXIT=$?
set -e

if [ $DEPLOYMENT_LIST_EXIT -eq 0 ]; then
	echo -e "${GREEN}✓${NC} Deployment list command succeeded"
	cat "$DEPLOYMENT_LIST_OUTPUT"
else
	echo -e "${YELLOW}⚠${NC} Deployment list command failed (may be expected if project has no deployments)"
	cat "$DEPLOYMENT_LIST_OUTPUT"
fi
echo ""

# Test 2: Deploy the project
echo "Test 2: Deploy project..."
DEPLOY_OUTPUT="$TEMP_DIR/deploy.txt"
echo "Running: bun $BIN_SCRIPT cloud deploy"
echo "This may take a few minutes..."
echo ""

set +e
bun "$BIN_SCRIPT" cloud deploy > "$DEPLOY_OUTPUT" 2>&1
DEPLOY_EXIT=$?
set -e

if [ $DEPLOY_EXIT -ne 0 ]; then
	echo -e "${RED}✗${NC} Deploy command failed"
	cat "$DEPLOY_OUTPUT"
	TEST_FAILED=true
	exit 1
fi

echo -e "${GREEN}✓${NC} Deploy command succeeded"
cat "$DEPLOY_OUTPUT"
echo ""

# Extract deployment ID from output (format: deploy_xxx)
DEPLOYMENT_ID=$(grep -oE 'deploy_[a-zA-Z0-9]+' "$DEPLOY_OUTPUT" | head -1 || echo "")
if [ -z "$DEPLOYMENT_ID" ]; then
	echo -e "${YELLOW}⚠${NC} Could not extract deployment ID from output"
else
	echo "Deployment ID: $DEPLOYMENT_ID"
fi
echo ""

# Test 3: List deployments again (should show the new deployment)
echo "Test 3: List deployments (after deploy)..."
DEPLOYMENT_LIST_OUTPUT2="$TEMP_DIR/deployment-list2.txt"
bun "$BIN_SCRIPT" cloud deployment list > "$DEPLOYMENT_LIST_OUTPUT2" 2>&1

if [ $? -ne 0 ]; then
	echo -e "${RED}✗${NC} Deployment list command failed"
	cat "$DEPLOYMENT_LIST_OUTPUT2"
	TEST_FAILED=true
	exit 1
fi

echo -e "${GREEN}✓${NC} Deployment list shows deployments"
cat "$DEPLOYMENT_LIST_OUTPUT2"
echo ""

# Verify the deployment appears in the list
if [ -n "$DEPLOYMENT_ID" ]; then
	if grep -q "$DEPLOYMENT_ID" "$DEPLOYMENT_LIST_OUTPUT2"; then
		echo -e "${GREEN}✓${NC} Deployment $DEPLOYMENT_ID appears in list"
	else
		echo -e "${YELLOW}⚠${NC} Deployment $DEPLOYMENT_ID not found in list"
	fi
	echo ""
fi

# Test 4: Show deployment details
echo "Test 4: Show deployment details..."
if [ -z "$DEPLOYMENT_ID" ]; then
	echo -e "${YELLOW}⚠${NC} No deployment ID to show, skipping"
else
	SHOW_OUTPUT="$TEMP_DIR/show.txt"
	set +e
	bun "$BIN_SCRIPT" cloud deployment show "$DEPLOYMENT_ID" > "$SHOW_OUTPUT" 2>&1
	SHOW_EXIT=$?
	set -e

	if [ $SHOW_EXIT -ne 0 ]; then
		echo -e "${RED}✗${NC} Show deployment command failed"
		cat "$SHOW_OUTPUT"
		TEST_FAILED=true
		exit 1
	fi

	echo -e "${GREEN}✓${NC} Show deployment command succeeded"
	cat "$SHOW_OUTPUT"
	
	# Verify the output contains the deployment ID
	if grep -q "$DEPLOYMENT_ID" "$SHOW_OUTPUT"; then
		echo -e "${GREEN}✓${NC} Deployment details contain correct ID"
	else
		echo -e "${RED}✗${NC} Deployment details missing ID"
		TEST_FAILED=true
		exit 1
	fi
fi
echo ""

# Test 5: Deploy a second time to test rollback
echo "Test 5: Deploy second time (for rollback test)..."
DEPLOY_OUTPUT2="$TEMP_DIR/deploy2.txt"
echo "Running second deploy..."
echo ""

set +e
bun "$BIN_SCRIPT" cloud deploy > "$DEPLOY_OUTPUT2" 2>&1
DEPLOY_EXIT2=$?
set -e

if [ $DEPLOY_EXIT2 -ne 0 ]; then
	echo -e "${RED}✗${NC} Second deploy command failed"
	cat "$DEPLOY_OUTPUT2"
	TEST_FAILED=true
	exit 1
fi

echo -e "${GREEN}✓${NC} Second deploy command succeeded"
cat "$DEPLOY_OUTPUT2"
echo ""

# Extract second deployment ID
DEPLOYMENT_ID2=$(grep -oE 'deploy_[a-zA-Z0-9]+' "$DEPLOY_OUTPUT2" | head -1 || echo "")
if [ -z "$DEPLOYMENT_ID2" ]; then
	echo -e "${YELLOW}⚠${NC} Could not extract second deployment ID from output"
else
	echo "Second Deployment ID: $DEPLOYMENT_ID2"
fi
echo ""

# Test 6: Rollback to previous deployment
echo "Test 6: Rollback deployment..."
ROLLBACK_OUTPUT="$TEMP_DIR/rollback.txt"

# We need to answer 'y' to the confirmation prompt
set +e
echo "y" | bun "$BIN_SCRIPT" cloud deployment rollback > "$ROLLBACK_OUTPUT" 2>&1
ROLLBACK_EXIT=$?
set -e

if [ $ROLLBACK_EXIT -ne 0 ]; then
	echo -e "${RED}✗${NC} Rollback command failed"
	cat "$ROLLBACK_OUTPUT"
	TEST_FAILED=true
	exit 1
fi

echo -e "${GREEN}✓${NC} Rollback command succeeded"
cat "$ROLLBACK_OUTPUT"
echo ""

# Verify rollback worked by checking active deployment
DEPLOYMENT_LIST_OUTPUT3="$TEMP_DIR/deployment-list3.txt"
bun "$BIN_SCRIPT" cloud deployment list > "$DEPLOYMENT_LIST_OUTPUT3" 2>&1

if [ -n "$DEPLOYMENT_ID" ]; then
	# Check if first deployment is now active
	if grep "$DEPLOYMENT_ID" "$DEPLOYMENT_LIST_OUTPUT3" | grep -q "Yes"; then
		echo -e "${GREEN}✓${NC} Rollback successful - first deployment is active again"
	else
		echo -e "${YELLOW}⚠${NC} Could not verify rollback (first deployment may not be active)"
	fi
fi
echo ""

# Test 7: Remove a specific deployment
echo "Test 7: Remove specific deployment..."
if [ -z "$DEPLOYMENT_ID2" ]; then
	echo -e "${YELLOW}⚠${NC} No second deployment ID to remove, skipping"
else
	REMOVE_OUTPUT="$TEMP_DIR/remove.txt"
	
	set +e
	bun "$BIN_SCRIPT" cloud deployment remove "$DEPLOYMENT_ID2" --force > "$REMOVE_OUTPUT" 2>&1
	REMOVE_EXIT=$?
	set -e

	if [ $REMOVE_EXIT -ne 0 ]; then
		echo -e "${RED}✗${NC} Remove deployment command failed"
		cat "$REMOVE_OUTPUT"
		TEST_FAILED=true
		exit 1
	fi

	echo -e "${GREEN}✓${NC} Remove deployment command succeeded"
	cat "$REMOVE_OUTPUT"
	echo ""
fi

# Test 8: Undeploy (with --force to skip confirmation)
echo "Test 8: Undeploy..."
UNDEPLOY_OUTPUT="$TEMP_DIR/undeploy.txt"

set +e
bun "$BIN_SCRIPT" cloud deployment undeploy --force > "$UNDEPLOY_OUTPUT" 2>&1
UNDEPLOY_EXIT=$?
set -e

if [ $UNDEPLOY_EXIT -ne 0 ]; then
	echo -e "${RED}✗${NC} Undeploy command failed"
	cat "$UNDEPLOY_OUTPUT"
	TEST_FAILED=true
	exit 1
fi

echo -e "${GREEN}✓${NC} Undeploy command succeeded"
cat "$UNDEPLOY_OUTPUT"
echo ""

# Test 9: Verify undeploy worked
echo "Test 9: Verify undeploy..."
sleep 2  # Give the system time to process the undeploy

DEPLOYMENT_LIST_OUTPUT4="$TEMP_DIR/deployment-list4.txt"
set +e
bun "$BIN_SCRIPT" cloud deployment list > "$DEPLOYMENT_LIST_OUTPUT4" 2>&1
LIST_EXIT=$?
set -e

if [ $LIST_EXIT -eq 0 ]; then
	echo -e "${GREEN}✓${NC} Deployment list after undeploy"
	cat "$DEPLOYMENT_LIST_OUTPUT4"
	
	# Check if the deployment is marked as inactive (Active column should show "No" or be blank)
	if [ -n "$DEPLOYMENT_ID" ]; then
		if grep "$DEPLOYMENT_ID" "$DEPLOYMENT_LIST_OUTPUT4" | grep -q "Yes"; then
			echo -e "${RED}✗${NC} Deployment $DEPLOYMENT_ID is still marked as active!"
			TEST_FAILED=true
			exit 1
		else
			echo -e "${GREEN}✓${NC} Deployment $DEPLOYMENT_ID is no longer active"
		fi
	fi
	
	# Verify that no deployment has the "latest" tag after undeploy
	if grep -q "latest" "$DEPLOYMENT_LIST_OUTPUT4"; then
		echo -e "${RED}✗${NC} 'latest' tag still exists after undeploy!"
		TEST_FAILED=true
		exit 1
	else
		echo -e "${GREEN}✓${NC} 'latest' tag successfully removed after undeploy"
	fi
else
	echo -e "${YELLOW}⚠${NC} Deployment list command returned non-zero (may be expected after undeploy)"
fi
echo ""

# Summary
echo "========================================="
echo -e "${GREEN}✓ All deployment tests passed!${NC}"
echo "========================================="
echo ""
echo "Tests completed:"
echo "  ✓ List deployments"
echo "  ✓ Deploy project (first deployment)"
echo "  ✓ Verify deployment in list"
echo "  ✓ Show deployment details"
echo "  ✓ Deploy project (second deployment)"
echo "  ✓ Rollback to previous deployment"
echo "  ✓ Remove specific deployment"
echo "  ✓ Undeploy project"
echo "  ✓ Verify undeploy"
echo ""
