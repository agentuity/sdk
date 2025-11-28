#!/bin/bash

# Database Resource Test Script
# Tests CLI commands for database resource management

set -e

# Get script directory and source shared library
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/test-lib.sh"

echo "========================================="
echo "Database Resource Test"
echo "========================================="
echo ""

BIN_SCRIPT="$(cd "$(dirname "$0")" && pwd)/../../../../packages/cli/bin/cli.ts"

# Check if user is authenticated
set +e
$BIN_SCRIPT auth whoami &> /dev/null
AUTH_CHECK=$?
set -e

if [ $AUTH_CHECK -ne 0 ]; then
	echo -e "${RED}✗ SKIP:${NC} Not authenticated. Run 'agentuity auth login' first."
	exit 0
fi

echo "Step 1: Creating a test database..."
set +e
CREATE_OUTPUT=$($BIN_SCRIPT cloud db create --name test-db-$(date +%s) 2>&1)
CREATE_EXIT=$?
set -e

echo "$CREATE_OUTPUT"

if [ $CREATE_EXIT -ne 0 ]; then
	echo ""
	echo -e "${RED}✗ FAIL:${NC} Database creation command failed with exit code: $CREATE_EXIT"
	echo -e "${YELLOW}Command output:${NC}"
	echo "$CREATE_OUTPUT"
	echo ""
	echo -e "${YELLOW}Attempting JSON output for more details...${NC}"
	set +e
	CREATE_JSON=$($BIN_SCRIPT --json cloud db create --name test-db-$(date +%s) 2>&1)
	JSON_EXIT=$?
	set -e
	echo "$CREATE_JSON"
	if [ $JSON_EXIT -ne 0 ]; then
		echo -e "${RED}JSON command also failed with exit code: $JSON_EXIT${NC}"
	fi
	exit 1
fi

# Extract database name from output
DB_NAME=$(echo "$CREATE_OUTPUT" | grep -oE "Created database: [a-zA-Z0-9_-]+" | sed 's/Created database: //' || true)

if [ -z "$DB_NAME" ]; then
	# Try JSON output if human-readable failed
	echo -e "${YELLOW}Could not extract database name from output, trying JSON...${NC}"
	set +e
	CREATE_JSON=$($BIN_SCRIPT --json cloud db create 2>&1)
	JSON_EXIT=$?
	set -e
	if [ $JSON_EXIT -ne 0 ]; then
		echo -e "${RED}✗ FAIL:${NC} JSON command failed with exit code: $JSON_EXIT"
		echo "$CREATE_JSON"
		exit 1
	fi
	DB_NAME=$(echo "$CREATE_JSON" | jq -r '.name' 2>/dev/null || echo "")
fi

if [ -z "$DB_NAME" ]; then
	echo -e "${RED}✗ FAIL:${NC} Failed to create database or extract database name"
	echo -e "${YELLOW}Command output:${NC}"
	echo "$CREATE_OUTPUT"
	exit 1
fi

echo -e "${GREEN}✓ PASS:${NC} Created database: $DB_NAME"
echo ""

# Step 2: List databases
echo "Step 2: Listing databases..."
LIST_OUTPUT=$($BIN_SCRIPT cloud db list 2>&1)
echo "$LIST_OUTPUT"

if echo "$LIST_OUTPUT" | grep -q "$DB_NAME"; then
	echo -e "${GREEN}✓ PASS:${NC} Database found in list"
else
	echo -e "${RED}✗ FAIL:${NC} Database not found in list"
	exit 1
fi
echo ""

# Step 3: Get database details
echo "Step 3: Getting database details..."
GET_OUTPUT=$($BIN_SCRIPT cloud db get "$DB_NAME" 2>&1)
echo "$GET_OUTPUT"

if echo "$GET_OUTPUT" | grep -q "$DB_NAME"; then
	echo -e "${GREEN}✓ PASS:${NC} Database details retrieved"
else
	echo -e "${RED}✗ FAIL:${NC} Failed to get database details"
	exit 1
fi
echo ""

# Step 4: Test JSON output
echo "Step 4: Testing JSON output..."
JSON_OUTPUT=$($BIN_SCRIPT --json cloud db get "$DB_NAME" 2>&1)
echo "$JSON_OUTPUT" | jq .

DB_NAME_JSON=$(echo "$JSON_OUTPUT" | jq -r '.name')
if [ "$DB_NAME_JSON" = "$DB_NAME" ]; then
	echo -e "${GREEN}✓ PASS:${NC} JSON output valid"
else
	echo -e "${RED}✗ FAIL:${NC} JSON output invalid"
	exit 1
fi
echo ""

# Step 5: Create test table
echo "Step 5: Creating test table..."
SQL_CREATE=$($BIN_SCRIPT cloud db sql "$DB_NAME" "CREATE TABLE test_users (id SERIAL PRIMARY KEY, name TEXT, email TEXT)" 2>&1)
echo "$SQL_CREATE"

if echo "$SQL_CREATE" | grep -qE "(No rows returned|✓)"; then
	echo -e "${GREEN}✓ PASS:${NC} Table created successfully"
else
	echo -e "${RED}✗ FAIL:${NC} Failed to create table"
	exit 1
fi
echo ""

# Step 6: Insert test data
echo "Step 6: Inserting test data..."
SQL_INSERT=$($BIN_SCRIPT cloud db sql "$DB_NAME" "INSERT INTO test_users (name, email) VALUES ('Alice', 'alice@example.com'), ('Bob', 'bob@example.com')" 2>&1)
echo "$SQL_INSERT"

if echo "$SQL_INSERT" | grep -qE "(No rows returned|✓)"; then
	echo -e "${GREEN}✓ PASS:${NC} Data inserted successfully"
else
	echo -e "${RED}✗ FAIL:${NC} Failed to insert data"
	exit 1
fi
echo ""

# Step 7: Query data (normal output)
echo "Step 7: Querying data (table output)..."
SQL_SELECT=$($BIN_SCRIPT cloud db sql "$DB_NAME" "SELECT * FROM test_users" 2>&1)
echo "$SQL_SELECT"

if echo "$SQL_SELECT" | grep -q "Alice"; then
	echo -e "${GREEN}✓ PASS:${NC} Query returned expected data"
else
	echo -e "${RED}✗ FAIL:${NC} Query did not return expected data"
	exit 1
fi
echo ""

# Step 8: Query data (JSON output)
echo "Step 8: Querying data (JSON output)..."
SQL_JSON=$($BIN_SCRIPT --json cloud db sql "$DB_NAME" "SELECT * FROM test_users ORDER BY id" 2>&1)
echo "$SQL_JSON" | jq .

ROW_COUNT=$(echo "$SQL_JSON" | jq -r '.rowCount')
FIRST_NAME=$(echo "$SQL_JSON" | jq -r '.rows[0].name')

if [ "$ROW_COUNT" = "2" ] && [ "$FIRST_NAME" = "Alice" ]; then
	echo -e "${GREEN}✓ PASS:${NC} JSON query output valid"
else
	echo -e "${RED}✗ FAIL:${NC} JSON query output invalid (rowCount: $ROW_COUNT, name: $FIRST_NAME)"
	exit 1
fi
echo ""

# Step 9: Delete the database
echo "Step 9: Deleting database..."
DELETE_OUTPUT=$($BIN_SCRIPT cloud db delete "$DB_NAME" --confirm 2>&1)
echo "$DELETE_OUTPUT"

if echo "$DELETE_OUTPUT" | grep -q "Deleted database"; then
	echo -e "${GREEN}✓ PASS:${NC} Database deleted"
else
	echo -e "${RED}✗ FAIL:${NC} Failed to delete database"
	exit 1
fi
echo ""

# Step 10: Verify deletion
echo "Step 10: Verifying database deletion..."
LIST_AFTER_DELETE=$($BIN_SCRIPT cloud db list 2>&1)
echo "$LIST_AFTER_DELETE"

if echo "$LIST_AFTER_DELETE" | grep -q "$DB_NAME"; then
	echo -e "${RED}✗ FAIL:${NC} Database still exists after deletion"
	exit 1
else
	echo -e "${GREEN}✓ PASS:${NC} Database successfully removed"
fi
echo ""

echo "========================================="
echo -e "${GREEN}ALL TESTS PASSED!${NC}"
echo "Database resource CLI commands working correctly."
echo "  ✓ create - Create database"
echo "  ✓ list - List databases"
echo "  ✓ get - Get database details"
echo "  ✓ sql - Execute SQL query (table output)"
echo "  ✓ sql - Execute SQL query (JSON output)"
echo "  ✓ delete - Delete database"
echo "  ✓ JSON output support"
echo "========================================="
echo ""
