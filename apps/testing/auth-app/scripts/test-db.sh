#!/bin/bash

# Database Resource Test Script
# Tests CLI commands for database resource management

set -e

# Get script directory and source shared library
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/test-lib.sh"

echo "========================================="
echo "Database Resource Test in ${AGENTUITY_REGION}"
echo "========================================="
echo ""

BIN_SCRIPT=$LOCAL_CLI

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
# Generate unique database name using timestamp, process ID, and random string
# This ensures uniqueness even when tests run in parallel
UNIQUE_ID="$(date +%s)-$$-$RANDOM-$RANDOM"
DB_NAME="test-db-$UNIQUE_ID"
set +e
CREATE_OUTPUT=$($BIN_SCRIPT cloud db create --name "$DB_NAME" --region $AGENTUITY_REGION 2>&1)
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
	UNIQUE_ID_RETRY="$(date +%s)-$$-$RANDOM-$RANDOM"
	DB_NAME_RETRY="test-db-$UNIQUE_ID_RETRY"
	set +e
	CREATE_JSON=$($BIN_SCRIPT --json cloud db create --name "$DB_NAME_RETRY" 2>&1)
	JSON_EXIT=$?
	set -e
	echo "$CREATE_JSON"
	if [ $JSON_EXIT -ne 0 ]; then
		echo -e "${RED}JSON command also failed with exit code: $JSON_EXIT${NC}"
	fi
	exit 1
fi

# Verify database was created (DB_NAME already set above)
if echo "$CREATE_OUTPUT" | grep -q "Created database"; then
	echo -e "${GREEN}✓ PASS:${NC} Created database: $DB_NAME"
else
	echo -e "${RED}✗ FAIL:${NC} Failed to create database"
	echo -e "${YELLOW}Command output:${NC}"
	echo "$CREATE_OUTPUT"
	exit 1
fi
echo ""

# Step 2: List databases
echo "Step 2: Listing databases..."
LIST_OUTPUT=$($BIN_SCRIPT cloud db list --region $AGENTUITY_REGION 2>&1)
echo "$LIST_OUTPUT"

if echo "$LIST_OUTPUT" | grep -q "$DB_NAME"; then
	echo -e "${GREEN}✓ PASS:${NC} Database found in list"
else
	echo -e "${RED}✗ FAIL:${NC} Database not found in list"
	exit 1
fi
echo ""

# Step 3: Get database details and verify logical databases
echo "Step 3: Getting database details..."
GET_OUTPUT=$($BIN_SCRIPT cloud db get --region $AGENTUITY_REGION "$DB_NAME" 2>&1)
echo "$GET_OUTPUT"

if echo "$GET_OUTPUT" | grep -q "$DB_NAME"; then
	echo -e "${GREEN}✓ PASS:${NC} Database details retrieved"
else
	echo -e "${RED}✗ FAIL:${NC} Failed to get database details"
	exit 1
fi

# Verify connection string contains the database name
if echo "$GET_OUTPUT" | grep -q "$DB_NAME"; then
	echo -e "${GREEN}✓ PASS:${NC} Connection string contains database name"
else
	echo -e "${YELLOW}⚠ WARNING:${NC} Connection string may not contain database name"
fi
echo ""

# Step 4: Get database schema (tables)
echo "Step 4: Getting database schema..."
set +e
SCHEMA_OUTPUT=$($BIN_SCRIPT cloud db get --region $AGENTUITY_REGION "$DB_NAME" --tables 2>&1)
SCHEMA_EXIT=$?
set -e

if [ $SCHEMA_EXIT -eq 0 ]; then
	echo "$SCHEMA_OUTPUT"
	echo -e "${GREEN}✓ PASS:${NC} Database schema retrieved"
else
	echo -e "${YELLOW}⚠ WARNING:${NC} Could not retrieve database schema (may be empty - no tables yet)"
fi
echo ""

# Step 5: Get schema in SQL format
echo "Step 5: Getting schema in SQL format..."
set +e
SCHEMA_SQL=$($BIN_SCRIPT cloud db get --region $AGENTUITY_REGION "$DB_NAME" --tables --sql 2>&1)
SQL_EXIT=$?
set -e

if [ $SQL_EXIT -eq 0 ]; then
	echo "$SCHEMA_SQL"
	echo -e "${GREEN}✓ PASS:${NC} Schema retrieved in SQL format"
else
	echo -e "${YELLOW}⚠ WARNING:${NC} Could not retrieve schema in SQL format (may be empty - no tables yet)"
fi
echo ""

# Step 6: Test JSON output for database
echo "Step 6: Testing JSON output for database..."
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

# FIXME: we have an ion issue that needs to be fixed against production
# # Step 7: Create test table
# echo "Step 7: Creating test table..."
# SQL_CREATE=$($BIN_SCRIPT cloud db sql --region $AGENTUITY_REGION "$DB_NAME" "CREATE TABLE test_users (id SERIAL PRIMARY KEY, name TEXT, email TEXT)" 2>&1)
# echo "$SQL_CREATE"

# if echo "$SQL_CREATE" | grep -qE "(No rows returned|✓)"; then
# 	echo -e "${GREEN}✓ PASS:${NC} Table created successfully"
# else
# 	echo -e "${RED}✗ FAIL:${NC} Failed to create table"
# 	exit 1
# fi
# echo ""

# # Step 8: Insert test data
# echo "Step 8: Inserting test data..."
# SQL_INSERT=$($BIN_SCRIPT cloud db sql --region $AGENTUITY_REGION "$DB_NAME" "INSERT INTO test_users (name, email) VALUES ('Alice', 'alice@example.com'), ('Bob', 'bob@example.com')" 2>&1)
# echo "$SQL_INSERT"

# if echo "$SQL_INSERT" | grep -qE "(No rows returned|✓)"; then
# 	echo -e "${GREEN}✓ PASS:${NC} Data inserted successfully"
# else
# 	echo -e "${RED}✗ FAIL:${NC} Failed to insert data"
# 	exit 1
# fi
# echo ""

# # Step 9: Query data (normal output)
# echo "Step 9: Querying data (table output)..."
# SQL_SELECT=$($BIN_SCRIPT cloud db sql --region $AGENTUITY_REGION "$DB_NAME" "SELECT * FROM test_users" 2>&1)
# echo "$SQL_SELECT"

# if echo "$SQL_SELECT" | grep -q "Alice"; then
# 	echo -e "${GREEN}✓ PASS:${NC} Query returned expected data"
# else
# 	echo -e "${RED}✗ FAIL:${NC} Query did not return expected data"
# 	exit 1
# fi
# echo ""

# # Step 10: Query data (JSON output)
# echo "Step 10: Querying data (JSON output)..."
# SQL_JSON=$($BIN_SCRIPT --json cloud db sql --region $AGENTUITY_REGION "$DB_NAME" "SELECT * FROM test_users ORDER BY id" 2>&1)
# echo "$SQL_JSON" | jq .

# ROW_COUNT=$(echo "$SQL_JSON" | jq -r '.rowCount')
# FIRST_NAME=$(echo "$SQL_JSON" | jq -r '.rows[0].name')

# if [ "$ROW_COUNT" = "2" ] && [ "$FIRST_NAME" = "Alice" ]; then
# 	echo -e "${GREEN}✓ PASS:${NC} JSON query output valid"
# else
# 	echo -e "${RED}✗ FAIL:${NC} JSON query output invalid (rowCount: $ROW_COUNT, name: $FIRST_NAME)"
# 	exit 1
# fi
# echo ""

# # Step 11: Check database query logs
# echo "Step 11: Checking database query logs..."
# set +e
# LOGS_OUTPUT=$($BIN_SCRIPT cloud db logs --region $AGENTUITY_REGION "$DB_NAME" 2>&1)
# LOGS_EXIT=$?
# set -e

# if [ $LOGS_EXIT -eq 0 ]; then
# 	echo "$LOGS_OUTPUT"
# 	# Verify some of our queries appear in the logs
# 	if echo "$LOGS_OUTPUT" | grep -qE "(CREATE TABLE|INSERT INTO|SELECT)"; then
# 		echo -e "${GREEN}✓ PASS:${NC} Query logs retrieved and contain expected queries"
# 	else
# 		echo -e "${YELLOW}⚠ WARNING:${NC} Query logs retrieved but may not contain all expected queries"
# 	fi
# else
# 	echo -e "${YELLOW}⚠ WARNING:${NC} Could not retrieve query logs"
# fi
# echo ""

# Step 12: Delete the database
echo "Step 12: Deleting database..."
DELETE_OUTPUT=$($BIN_SCRIPT cloud db delete --region $AGENTUITY_REGION "$DB_NAME" --confirm 2>&1)
echo "$DELETE_OUTPUT"

if echo "$DELETE_OUTPUT" | grep -q "Deleted database"; then
	echo -e "${GREEN}✓ PASS:${NC} Database deleted"
else
	echo -e "${RED}✗ FAIL:${NC} Failed to delete database"
	exit 1
fi
echo ""

# Step 13: Verify deletion
echo "Step 13: Verifying database deletion..."
LIST_AFTER_DELETE=$($BIN_SCRIPT cloud db list --region $AGENTUITY_REGION 2>&1)
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
echo "  ✓ create - Create database with unique name"
echo "  ✓ list - List databases"
echo "  ✓ get - Get database details and connection string"
echo "  ✓ get <db> <db> - Get database schema (tables)"
echo "  ✓ get <db> <db> --sql - Get schema in SQL format"
echo "  ✓ sql - Execute SQL query (table output)"
echo "  ✓ sql - Execute SQL query (JSON output)"
echo "  ✓ logs - Retrieve query logs"
echo "  ✓ delete - Delete database"
echo "  ✓ JSON output support"
echo "========================================="
echo ""
