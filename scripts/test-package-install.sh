#!/usr/bin/env bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}ℹ ${1}${NC}"
}

log_success() {
    echo -e "${GREEN}✓ ${1}${NC}"
}

log_error() {
    echo -e "${RED}✗ ${1}${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠ ${1}${NC}"
}

# Get script directory (where this script lives)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PACKAGES_DIR="/tmp/test-packages-$(date +%s)"
TEST_PROJECT_DIR="/tmp/test-project-$(date +%s)"
CLI_TEST_DIR=""

cleanup() {
    log_info "Cleaning up..."
    rm -rf "$PACKAGES_DIR" "$TEST_PROJECT_DIR" "$CLI_TEST_DIR"
}

# Cleanup on exit
trap cleanup EXIT

log_info "SDK root: $SDK_ROOT"
log_info "Packages dir: $PACKAGES_DIR"
log_info "Test project dir: $TEST_PROJECT_DIR"

# Step 1 & 2: Use shared prepare script
log_info "Step 1 & 2: Building and packing SDK packages..."
bash "$SCRIPT_DIR/prepare-sdk-for-testing.sh"
log_success "SDK prepared"

# Copy tarballs to our test directory
log_info "Copying tarballs to test directory..."
mkdir -p "$PACKAGES_DIR"
cp "$SDK_ROOT/dist/packages"/*.tgz "$PACKAGES_DIR/"
log_success "Tarballs copied"

# Build dependency and override JSON from all packed tarballs dynamically.
# This avoids hardcoding package names and automatically picks up new packages.
DEPS_JSON="{}"
OVERRIDES_JSON="{}"

echo ""
log_info "Using tarballs:"
for tgz in "$PACKAGES_DIR"/agentuity-*.tgz; do
    filename=$(basename "$tgz")
    # Extract package name from tarball: agentuity-core-2.0.9.tgz -> @agentuity/core
    # Handle names with hyphens: agentuity-claude-code-2.0.9.tgz -> @agentuity/claude-code
    # Strip the "agentuity-" prefix, then strip the version suffix (-X.Y.Z*.tgz)
    bare="${filename#agentuity-}"
    # Remove version: everything from the last sequence of -DIGIT onwards
    pkg_short=$(echo "$bare" | sed 's/-[0-9][0-9]*\..*//')
    pkg_name="@agentuity/$pkg_short"
    pkg_ref="file:$PACKAGES_DIR/$filename"

    log_success "  $filename -> $pkg_name"
    DEPS_JSON=$(echo "$DEPS_JSON" | jq --arg n "$pkg_name" --arg r "$pkg_ref" '. + {($n): $r}')
    OVERRIDES_JSON=$(echo "$OVERRIDES_JSON" | jq --arg n "$pkg_name" --arg r "$pkg_ref" '. + {($n): $r}')
done

# Step 3: Validate CLI runs from packed tarball without project TypeScript
# This catches the case where a runtime dependency (like typescript) is incorrectly
# placed in devDependencies, which would cause bunx @agentuity/cli to fail
echo ""
log_info "Step 3: Validating CLI runs from packed tarball without project TypeScript..."

CLI_TEST_DIR="/tmp/cli-test-$(date +%s)"
mkdir -p "$CLI_TEST_DIR"
cd "$CLI_TEST_DIR"

# Minimal package.json with all @agentuity packages from local tarballs
jq -n --argjson deps "$DEPS_JSON" --argjson overrides "$OVERRIDES_JSON" '{
  name: "cli-typescript-smoke-test",
  version: "1.0.0",
  private: true,
  dependencies: $deps,
  overrides: $overrides
}' > package.json

log_info "Installing CLI and dependencies from packed tarballs..."
bun install

export AGENTUITY_SKIP_VERSION_CHECK=1

# Run CLI version from the local node_modules bin to trigger module loading
# We capture output but don't fail on exit code since some commands may have other issues
log_info "Running agentuity version..."
node_modules/.bin/agentuity version >cli-output.log 2>&1 || true

# Explicitly guard against the original error where typescript was in devDependencies
# This is the specific regression we want to catch
if grep -q "Cannot find package 'typescript'" cli-output.log; then
  log_error "CLI reported missing typescript when run from packed tarball"
  cat cli-output.log || true
  exit 1
fi

log_success "CLI runs from packed tarball without missing TypeScript dependency"

# Also verify the version command actually produced output (not just an empty file)
if [ ! -s cli-output.log ]; then
  log_warning "CLI version produced no output (may be expected for some configs)"
else
  log_info "CLI output:"
  cat cli-output.log
fi

cd "$SDK_ROOT"

# Step 4: Create a test project
echo ""
log_info "Step 4: Creating test project..."
mkdir -p "$TEST_PROJECT_DIR"
cd "$TEST_PROJECT_DIR"

# Use the CLI to create a project
log_info "Running agentuity new..."
AGENTUITY_SKIP_VERSION_CHECK=1 bun "$SDK_ROOT/packages/cli/bin/cli.ts" new \
    --name smoke-test-project \
    --framework vite-react \
    --no-register \
    -y \
    2>&1 || {
    log_error "Failed to create test project"
    exit 1
}

if [ ! -d "smoke-test-project" ]; then
    log_error "Project directory not created"
    exit 1
fi

cd smoke-test-project
log_success "Project created"

# Step 5: Install packages from tarballs
echo ""
log_info "Step 5: Installing packed packages..."

# Update package.json to use tarball file references and add overrides
# This ensures bun resolves all @agentuity packages from local tarballs, not npm
log_info "Rewriting package.json to use tarball dependencies with overrides..."
jq --argjson refs "$DEPS_JSON" --argjson overrides "$OVERRIDES_JSON" '
    # Helper: update package in its existing location (dependencies or devDependencies)
    # If in devDependencies, update there; otherwise add to dependencies
    def update_pkg($pkg; $ref):
      if .devDependencies[$pkg] then
        .devDependencies[$pkg] = $ref
      elif .dependencies[$pkg] then
        .dependencies[$pkg] = $ref
      else
        .dependencies[$pkg] = $ref
      end;

    # Update all @agentuity packages found in the tarball set
    reduce ($refs | to_entries[]) as $e (.; update_pkg($e.key; $e.value)) |
    # Add overrides to force transitive dependencies to use local tarballs
    .overrides = $overrides
  ' package.json > package.json.tmp && mv package.json.tmp package.json

# Install all dependencies (bun will use overrides for @agentuity packages)
log_info "Installing all dependencies..."
bun install

# Remove nested @agentuity packages that Bun installed from npm (instead of using workspace tarballs)
# This happens because workspace:* dependencies get resolved to specific versions (e.g. 0.0.58)
# and Bun installs those from npm as nested dependencies, shadowing the correct local tarballs
#
# We need to remove ALL nested @agentuity packages to ensure proper module resolution
for pkg_dir in node_modules/@agentuity/*/node_modules/@agentuity; do
  if [ -d "$pkg_dir" ]; then
    log_warning "Removing nested @agentuity packages from $(dirname $pkg_dir)"
    rm -rf "$pkg_dir"
  fi
done

# Step 6: Build the project
echo ""
log_info "Step 6: Building project..."
log_info "Building project..."
bun run build 2>&1 || {
    log_error "Build failed"
    exit 1
}
log_success "Build completed"

# Step 7: Quick verify - ensure the build output exists
echo ""
log_info "Step 7: Verifying build output..."
if [ -d ".output" ] || [ -d "dist" ] || [ -d ".vinxi" ] || [ -d "build" ]; then
    log_success "Build output directory exists"
else
    log_warning "No standard build output directory found (.output, dist, .vinxi, build)"
fi

echo ""
log_success "All smoke tests passed!"
