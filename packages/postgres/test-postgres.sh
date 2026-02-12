#!/usr/bin/env bash
#
# test-postgres.sh — Run SSL integration tests against PostgreSQL.
#
# Usage:
#   ./test-postgres.sh                     # Local Docker container (SSL-enabled)
#   ./test-postgres.sh --keep              # Keep Docker container after tests
#   ./test-postgres.sh --cleanup           # Remove leftover container and certs
#   ./test-postgres.sh --cloud <url>       # Test against a cloud database URL
#
# Requirements: bun (+ docker & openssl for local mode)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTAINER_NAME="agentuity-postgres-ssl-test"
PG_PORT=54320
PG_USER="testuser"
PG_PASS="testpass"
PG_DB="testdb"
CERT_DIR="$SCRIPT_DIR/.tmp-certs"
KEEP_CONTAINER=false
CLOUD_URL=""
MODE="local"

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
	case "$1" in
	--keep)
		KEEP_CONTAINER=true
		shift
		;;
	--cleanup)
		echo "🧹 Cleaning up..."
		docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
		rm -rf "$CERT_DIR"
		echo "   Done."
		exit 0
		;;
	--cloud)
		MODE="cloud"
		CLOUD_URL="${2:?'--cloud requires a database URL argument'}"
		shift 2
		;;
	*)
		echo "Unknown argument: $1"
		echo "Usage: $0 [--keep | --cleanup | --cloud <url>]"
		exit 1
		;;
	esac
done

# ---------------------------------------------------------------------------
# Cloud mode — skip Docker, test directly against remote URL
# ---------------------------------------------------------------------------
if [ "$MODE" = "cloud" ]; then
	echo "☁️  Cloud mode — testing against remote database"
	echo ""

	# The cloud URL already has ?sslmode=require
	SSL_URL="$CLOUD_URL"

	# Build a plain URL by stripping sslmode
	PLAIN_URL=$(echo "$CLOUD_URL" | sed 's/[?&]sslmode=[^&]*//')

	echo "📋 Connection URLs:"
	echo "   SSL   : ${SSL_URL%%@*}@<redacted>"
	echo "   Plain : ${PLAIN_URL%%@*}@<redacted>"
	echo ""

	echo "🧪 Running integration tests..."
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

	TEST_SSL_URL="$SSL_URL" \
		TEST_PLAIN_URL="$PLAIN_URL" \
		bun run "$SCRIPT_DIR/test/integration/ssl-connection.ts"

	EXIT_CODE=$?

	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

	if [ $EXIT_CODE -eq 0 ]; then
		echo "✅ All integration tests passed!"
	else
		echo "❌ Integration tests failed (exit code: $EXIT_CODE)"
	fi

	exit $EXIT_CODE
fi

# ---------------------------------------------------------------------------
# Local mode — Docker container
# ---------------------------------------------------------------------------

# Cleanup trap — remove container + certs on exit (unless --keep)
cleanup() {
	if [ "$KEEP_CONTAINER" = false ]; then
		echo ""
		echo "🧹 Cleaning up..."
		docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
		rm -rf "$CERT_DIR"
		echo "   Done."
	else
		echo ""
		echo "ℹ️  Container '$CONTAINER_NAME' left running on port $PG_PORT"
		echo "   Connection URL: postgresql://$PG_USER:$PG_PASS@localhost:$PG_PORT/$PG_DB?sslmode=require"
		echo "   To stop:  docker rm -f $CONTAINER_NAME"
		echo "   To clean: $0 --cleanup"
	fi
}
trap cleanup EXIT

# Remove stale container if present
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
	echo "⚠️  Removing stale container '$CONTAINER_NAME'..."
	docker rm -f "$CONTAINER_NAME" >/dev/null
fi

# Generate self-signed certificates for PostgreSQL SSL
echo "🔐 Generating self-signed TLS certificates..."
rm -rf "$CERT_DIR"
mkdir -p "$CERT_DIR"

openssl req -new -x509 -nodes \
	-days 1 \
	-subj "/CN=Test-CA" \
	-keyout "$CERT_DIR/ca-key.pem" \
	-out "$CERT_DIR/ca-cert.pem" \
	2>/dev/null

openssl req -new -nodes \
	-subj "/CN=localhost" \
	-keyout "$CERT_DIR/server-key.pem" \
	-out "$CERT_DIR/server-req.pem" \
	2>/dev/null

openssl x509 -req \
	-in "$CERT_DIR/server-req.pem" \
	-CA "$CERT_DIR/ca-cert.pem" \
	-CAkey "$CERT_DIR/ca-key.pem" \
	-CAcreateserial \
	-days 1 \
	-out "$CERT_DIR/server-cert.pem" \
	2>/dev/null

chmod 600 "$CERT_DIR/server-key.pem"
echo "   Certificates written to $CERT_DIR"

# Start PostgreSQL container with SSL
echo "🐘 Starting PostgreSQL container (port $PG_PORT, SSL enabled)..."

docker run -d \
	--name "$CONTAINER_NAME" \
	-p "${PG_PORT}:5432" \
	-e POSTGRES_USER="$PG_USER" \
	-e POSTGRES_PASSWORD="$PG_PASS" \
	-e POSTGRES_DB="$PG_DB" \
	-v "$CERT_DIR/server-cert.pem:/var/lib/postgresql/server.crt:ro" \
	-v "$CERT_DIR/server-key.pem:/var/lib/postgresql/server.key:ro" \
	-v "$CERT_DIR/ca-cert.pem:/var/lib/postgresql/ca.crt:ro" \
	postgres:17-alpine \
	-c ssl=on \
	-c ssl_cert_file=/var/lib/postgresql/server.crt \
	-c ssl_key_file=/var/lib/postgresql/server.key \
	-c ssl_ca_file=/var/lib/postgresql/ca.crt \
	>/dev/null

# Wait for PostgreSQL to accept connections
echo "⏳ Waiting for PostgreSQL to be ready..."
MAX_WAIT=30
for i in $(seq 1 $MAX_WAIT); do
	if docker exec "$CONTAINER_NAME" pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1; then
		echo "   Ready after ${i}s"
		break
	fi
	if [ "$i" -eq "$MAX_WAIT" ]; then
		echo "❌ PostgreSQL did not become ready within ${MAX_WAIT}s"
		docker logs "$CONTAINER_NAME" 2>&1 | tail -20
		exit 1
	fi
	sleep 1
done

BASE_URL="postgresql://$PG_USER:$PG_PASS@localhost:$PG_PORT/$PG_DB"
SSL_URL="${BASE_URL}?sslmode=require"
PLAIN_URL="$BASE_URL"

echo ""
echo "📋 Connection URLs:"
echo "   Plain : $PLAIN_URL"
echo "   SSL   : $SSL_URL"
echo ""

echo "🧪 Running integration tests..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TEST_SSL_URL="$SSL_URL" \
	TEST_PLAIN_URL="$PLAIN_URL" \
	TEST_CA_CERT="$CERT_DIR/ca-cert.pem" \
	bun run "$SCRIPT_DIR/test/integration/ssl-connection.ts"

EXIT_CODE=$?

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $EXIT_CODE -eq 0 ]; then
	echo "✅ All integration tests passed!"
else
	echo "❌ Integration tests failed (exit code: $EXIT_CODE)"
fi

exit $EXIT_CODE
