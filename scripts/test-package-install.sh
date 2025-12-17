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

# Step 1: Build all packages (skip test apps)
log_info "Step 1: Building all packages..."
cd "$SDK_ROOT"
bunx tsc --build --force

# Verify dist/ directories exist after build
log_info "Verifying dist/ directories exist after build..."
for pkg in core schema react auth runtime server cli; do
    if [ ! -d "packages/$pkg/dist" ]; then
        log_error "Package $pkg missing dist/ directory after build"
        log_info "Contents of packages/$pkg/:"
        ls -la "packages/$pkg/" || true
        exit 1
    fi
    log_success "$pkg has dist/"
done
log_success "Build complete"

# Step 2: Pack packages
log_info "Step 2: Packing packages..."
mkdir -p "$PACKAGES_DIR"

cd "$SDK_ROOT/packages/core"
CORE_PKG=$(bun pm pack --destination "$PACKAGES_DIR" --quiet | xargs basename)
log_success "Packed core: $CORE_PKG"

cd "$SDK_ROOT/packages/schema"
SCHEMA_PKG=$(bun pm pack --destination "$PACKAGES_DIR" --quiet | xargs basename)
log_success "Packed schema: $SCHEMA_PKG"

cd "$SDK_ROOT/packages/react"
REACT_PKG=$(bun pm pack --destination "$PACKAGES_DIR" --quiet | xargs basename)
log_success "Packed react: $REACT_PKG"

cd "$SDK_ROOT/packages/auth"
AUTH_PKG=$(bun pm pack --destination "$PACKAGES_DIR" --quiet | xargs basename)
log_success "Packed auth: $AUTH_PKG"

cd "$SDK_ROOT/packages/runtime"
RUNTIME_PKG=$(bun pm pack --destination "$PACKAGES_DIR" --quiet | xargs basename)
log_success "Packed runtime: $RUNTIME_PKG"

cd "$SDK_ROOT/packages/server"
SERVER_PKG=$(bun pm pack --destination "$PACKAGES_DIR" --quiet | xargs basename)
log_success "Packed server: $SERVER_PKG"

cd "$SDK_ROOT/packages/cli"
CLI_PKG=$(bun pm pack --destination "$PACKAGES_DIR" --quiet | xargs basename)
log_success "Packed cli: $CLI_PKG"

# Build workbench (includes CSS build) before packing
cd "$SDK_ROOT/packages/workbench"
log_info "Building workbench (TypeScript + CSS)..."
bun run build
if [ ! -f "dist/standalone.css" ]; then
    log_error "Workbench dist/standalone.css not found after build"
    exit 1
fi
log_success "Workbench built with CSS"
WORKBENCH_PKG=$(bun pm pack --destination "$PACKAGES_DIR" --quiet | xargs basename)
log_success "Packed workbench: $WORKBENCH_PKG"

echo ""
log_info "Packed packages:"
ls -lh "$PACKAGES_DIR"

# Verify tarballs contain dist/ - fail if missing
echo ""
log_info "Verifying package contents..."
VERIFY_DIR=$(mktemp -d)
for pkg in "$CORE_PKG" "$SCHEMA_PKG" "$REACT_PKG" "$AUTH_PKG" "$RUNTIME_PKG" "$SERVER_PKG" "$CLI_PKG" "$WORKBENCH_PKG"; do
  # Extract tarball and check for dist/ directory
  tar -xzf "$PACKAGES_DIR/$pkg" -C "$VERIFY_DIR"
  
  if [ -d "$VERIFY_DIR/package/dist" ]; then
    log_success "$pkg contains dist/"
    
    # Special check for workbench: verify standalone.css exists
    if [ "$pkg" = "$WORKBENCH_PKG" ]; then
      if [ -f "$VERIFY_DIR/package/dist/standalone.css" ]; then
        log_success "$pkg contains dist/standalone.css"
      else
        log_error "Package $pkg missing dist/standalone.css"
        log_info "Contents of $VERIFY_DIR/package/dist/:"
        ls -la "$VERIFY_DIR/package/dist/" || true
        exit 1
      fi
    fi
  else
    log_error "Package $pkg missing dist/ directory"
    log_info "Contents of $pkg:"
    ls -la "$VERIFY_DIR/package/" || true
    exit 1
  fi
  
  # Clean up extracted files for next package
  rm -rf "$VERIFY_DIR/package"
done
rm -rf "$VERIFY_DIR"
log_success "All packages contain dist/"

# Step 3: Validate CLI runs from packed tarball without project TypeScript
# This catches the case where a runtime dependency (like typescript) is incorrectly
# placed in devDependencies, which would cause bunx @agentuity/cli to fail
echo ""
log_info "Step 3: Validating CLI runs from packed tarball without project TypeScript..."

CLI_TEST_DIR="/tmp/cli-test-$(date +%s)"
mkdir -p "$CLI_TEST_DIR"
cd "$CLI_TEST_DIR"

# Minimal package.json with no TypeScript so we don't accidentally rely on it
cat > package.json << 'EOF'
{
  "name": "cli-typescript-smoke-test",
  "version": "1.0.0",
  "private": true
}
EOF

log_info "Installing CLI and dependencies from packed tarballs..."
bun add "$PACKAGES_DIR/$CORE_PKG"
bun add "$PACKAGES_DIR/$SCHEMA_PKG"
bun add "$PACKAGES_DIR/$REACT_PKG"
bun add "$PACKAGES_DIR/$AUTH_PKG"
bun add "$PACKAGES_DIR/$RUNTIME_PKG"
bun add "$PACKAGES_DIR/$SERVER_PKG"
bun add "$PACKAGES_DIR/$CLI_PKG"
bun add "$PACKAGES_DIR/$WORKBENCH_PKG"

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

# Step 4: Create test project using CLI
echo ""
log_info "Step 4: Creating test project with CLI..."
mkdir -p "$TEST_PROJECT_DIR"
cd "$TEST_PROJECT_DIR"

export AGENTUITY_SKIP_VERSION_CHECK=1
bun "$SDK_ROOT/packages/cli/bin/cli.ts" \
  --config "$SDK_ROOT/packages/cli/examples/noauth-profile.yaml" \
  create \
  --name "smoke-test-project" \
  --template-dir "$SDK_ROOT/templates" \
  --no-register \
  --no-install \
  --no-build \
  --confirm 2>&1 || {
    log_error "CLI create failed"
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

# Remove Agentuity dependencies from package.json to avoid conflicts (both dependencies and devDependencies)
cat package.json | \
  jq 'del(.dependencies["@agentuity/cli"], .dependencies["@agentuity/core"], .dependencies["@agentuity/schema"], .dependencies["@agentuity/react"], .dependencies["@agentuity/auth"], .dependencies["@agentuity/runtime"], .dependencies["@agentuity/server"], .dependencies["@agentuity/workbench"], .devDependencies["@agentuity/cli"], .devDependencies["@agentuity/core"], .devDependencies["@agentuity/schema"], .devDependencies["@agentuity/react"], .devDependencies["@agentuity/auth"], .devDependencies["@agentuity/runtime"], .devDependencies["@agentuity/server"], .devDependencies["@agentuity/workbench"])' \
  > package.json.tmp && mv package.json.tmp package.json

# Install other dependencies first
log_info "Installing other dependencies..."
bun install

# Now install Agentuity packages from tarballs
# Install with --no-save to prevent Bun from trying to resolve nested dependencies from npm
log_info "Installing @agentuity packages from tarballs..."
bun add --no-save \
  "$PACKAGES_DIR/$CORE_PKG" \
  "$PACKAGES_DIR/$SCHEMA_PKG" \
  "$PACKAGES_DIR/$REACT_PKG" \
  "$PACKAGES_DIR/$AUTH_PKG" \
  "$PACKAGES_DIR/$RUNTIME_PKG" \
  "$PACKAGES_DIR/$SERVER_PKG" \
  "$PACKAGES_DIR/$CLI_PKG" \
  "$PACKAGES_DIR/$WORKBENCH_PKG"

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

log_success "All packages installed"

# Step 6: Build the project
echo ""
log_info "Step 6: Building the project..."
bun run build

# Verify build outputs exist
if [ ! -d ".agentuity" ]; then
    log_error "Build output directory (.agentuity) not found"
    exit 1
fi

# Verify registry file was generated
if [ ! -f ".agentuity/registry.generated.ts" ]; then
    log_error "registry.generated.ts not found in .agentuity/"
    log_info "Contents of .agentuity/:"
    ls -la .agentuity/
    exit 1
fi

log_success "Build complete, .agentuity directory created"
log_success "Registry file generated"

# Step 7: Typecheck
echo ""
log_info "Step 7: Running typecheck..."
bunx tsc --noEmit
log_success "Typecheck passed"

# Success!
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🎉 All tests passed!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
log_success "Built and packed all 7 packages"
log_success "CLI runs from packed tarball without missing TypeScript"
log_success "Created new project using CLI with --template-dir"
log_success "Installed packed packages as if from npm registry"
log_success "Project builds successfully (agentuity bundle)"
log_success "Project typechecks with strict TypeScript"
