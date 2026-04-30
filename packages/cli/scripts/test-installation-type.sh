#!/bin/bash
# Comprehensive installation type detection tests
# Tests various installation scenarios to ensure global vs local detection works correctly

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0

# Test helper function
run_test() {
    local test_name="$1"
    local expected="$2"
    local actual="$3"
    
    if [ "$actual" = "$expected" ]; then
        echo -e "${GREEN}✓${NC} $test_name: $actual"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗${NC} $test_name: expected '$expected', got '$actual'"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

echo "========================================"
echo "Installation Type Detection Tests"
echo "========================================"
echo ""

# For tests that need to simulate running FROM a specific path, we need to
# create a script at that path that contains the detection logic
# This script mirrors the actual implementation in installation-type.ts
run_scenario_from_path() {
    local home_dir="$1"
    local bun_install="$2"
    local script_path="$3"
    
    # Create a wrapper at the target path
    local wrapper_dir=$(dirname "$script_path")
    mkdir -p "$wrapper_dir"
    
    # The detection logic - must match the actual implementation!
    cat > "$script_path" << 'INNEREOF'
import fs from 'node:fs';
import os from 'node:os';

type InstallationType = 'global' | 'local' | 'source';

function resolveRealPath(path: string): string {
    if (!path) return '';
    try {
        return fs.realpathSync(path).replace(/\\/g, '/');
    } catch {
        return path.replace(/\\/g, '/');
    }
}

function getInstallationType(): InstallationType {
    const mainPath = Bun.main.replace(/\\/g, '/');
    const home = resolveRealPath(os.homedir() ?? process.env.HOME ?? process.env.USERPROFILE ?? '');
    const bunInstallRaw = process.env.BUN_INSTALL ?? (home ? `${home}/.bun` : '');
    const bunInstall = resolveRealPath(bunInstallRaw);

    // GLOBAL DETECTION: Check if running from bun's global install location
    if (bunInstall) {
        if (mainPath.startsWith(`${bunInstall}/node_modules/@agentuity/cli/`)) {
            return 'global';
        }
        if (mainPath.startsWith(`${bunInstall}/install/global/`)) {
            return 'global';
        }
    }

    // GLOBAL DETECTION: Check for legacy ~/.agentuity/ installation
    if (home) {
        const agentuityDir = resolveRealPath(`${home}/.agentuity`);
        if (mainPath.startsWith(`${agentuityDir}/`)) {
            return 'global';
        }
    }

    // GLOBAL DETECTION: Fallback check for any path containing /.bun/ before node_modules
    if (mainPath.includes('/.bun/') && mainPath.includes('/node_modules/@agentuity/cli/')) {
        return 'global';
    }

    // LOCAL DETECTION: Running from a project's node_modules
    if (mainPath.includes('/node_modules/@agentuity/cli/')) {
        return 'local';
    }

    // SOURCE DETECTION: Running from source code (development)
    return 'source';
}

console.log(getInstallationType());
INNEREOF

    if [ -n "$bun_install" ]; then
        HOME="$home_dir" BUN_INSTALL="$bun_install" bun "$script_path" 2>/dev/null
    else
        # Unset BUN_INSTALL so the script uses the default (~/.bun)
        unset BUN_INSTALL
        HOME="$home_dir" bun "$script_path" 2>/dev/null
    fi
}

echo "----------------------------------------"
echo "TEST 1: Default global install (~/.bun)"
echo "----------------------------------------"

rm -rf /tmp/test-default-global
mkdir -p /tmp/test-default-global/.bun/node_modules/@agentuity/cli/bin

result=$(run_scenario_from_path "/tmp/test-default-global" "" "/tmp/test-default-global/.bun/node_modules/@agentuity/cli/bin/cli.js")
run_test "Default global install (~/.bun/node_modules)" "global" "$result"

echo ""
echo "----------------------------------------"
echo "TEST 2: Custom BUN_INSTALL location"
echo "----------------------------------------"

rm -rf /tmp/test-custom-bun
mkdir -p /tmp/test-custom-bun/custom-bun/node_modules/@agentuity/cli/bin

result=$(run_scenario_from_path "/tmp/test-custom-bun" "/tmp/test-custom-bun/custom-bun" "/tmp/test-custom-bun/custom-bun/node_modules/@agentuity/cli/bin/cli.js")
run_test "Custom BUN_INSTALL location" "global" "$result"

echo ""
echo "----------------------------------------"
echo "TEST 3: Legacy ~/.agentuity installation"
echo "----------------------------------------"

rm -rf /tmp/test-legacy
mkdir -p /tmp/test-legacy/.agentuity/node_modules/@agentuity/cli/bin

result=$(run_scenario_from_path "/tmp/test-legacy" "" "/tmp/test-legacy/.agentuity/node_modules/@agentuity/cli/bin/cli.js")
run_test "Legacy ~/.agentuity installation" "global" "$result"

echo ""
echo "----------------------------------------"
echo "TEST 4: ~/.bun/install/global layout"
echo "----------------------------------------"

rm -rf /tmp/test-bun-install-global
mkdir -p /tmp/test-bun-install-global/.bun/install/global/node_modules/@agentuity/cli/bin

result=$(run_scenario_from_path "/tmp/test-bun-install-global" "" "/tmp/test-bun-install-global/.bun/install/global/node_modules/@agentuity/cli/bin/cli.js")
run_test "~/.bun/install/global layout" "global" "$result"

echo ""
echo "----------------------------------------"
echo "TEST 5: Local project installation"
echo "----------------------------------------"

rm -rf /tmp/test-local
mkdir -p /tmp/test-local/my-project/node_modules/@agentuity/cli/bin
mkdir -p /tmp/test-local/.bun  # Empty .bun to ensure it doesn't match

result=$(run_scenario_from_path "/tmp/test-local" "" "/tmp/test-local/my-project/node_modules/@agentuity/cli/bin/cli.js")
run_test "Local project installation" "local" "$result"

echo ""
echo "----------------------------------------"
echo "TEST 6: Source/development mode"
echo "----------------------------------------"

rm -rf /tmp/test-source
mkdir -p /tmp/test-source/sdk/packages/cli/src
mkdir -p /tmp/test-source/.bun  # Empty .bun to ensure it doesn't match

result=$(run_scenario_from_path "/tmp/test-source" "" "/tmp/test-source/sdk/packages/cli/src/main.ts")
run_test "Source/development mode" "source" "$result"

echo ""
echo "----------------------------------------"
echo "TEST 7: Nested project with global available"
echo "----------------------------------------"

rm -rf /tmp/test-nested
mkdir -p /tmp/test-nested/.bun/node_modules/@agentuity/cli/bin  # Global install exists
mkdir -p /tmp/test-nested/projects/my-app/node_modules/@agentuity/cli/bin  # Local install

# Running from local should detect as local
result=$(run_scenario_from_path "/tmp/test-nested" "" "/tmp/test-nested/projects/my-app/node_modules/@agentuity/cli/bin/cli.js")
run_test "Local install when global exists (run local)" "local" "$result"

# Running from global should detect as global
result=$(run_scenario_from_path "/tmp/test-nested" "" "/tmp/test-nested/.bun/node_modules/@agentuity/cli/bin/cli.js")
run_test "Local install when global exists (run global)" "global" "$result"

echo ""
echo "----------------------------------------"
echo "TEST 8: Custom BUN_INSTALL with different home"
echo "----------------------------------------"

rm -rf /tmp/test-different-paths
mkdir -p /tmp/test-different-paths/home-dir/.bun  # Empty, not used
mkdir -p /tmp/test-different-paths/bun-install/node_modules/@agentuity/cli/bin

result=$(run_scenario_from_path "/tmp/test-different-paths/home-dir" "/tmp/test-different-paths/bun-install" "/tmp/test-different-paths/bun-install/node_modules/@agentuity/cli/bin/cli.js")
run_test "BUN_INSTALL different from HOME" "global" "$result"

echo ""
echo "----------------------------------------"
echo "TEST 9: Symlinked global binary"
echo "----------------------------------------"

rm -rf /tmp/test-symlink
mkdir -p /tmp/test-symlink/.bun/node_modules/@agentuity/cli/bin
mkdir -p /tmp/test-symlink/.bun/bin

# Create the actual script
run_scenario_from_path "/tmp/test-symlink" "" "/tmp/test-symlink/.bun/node_modules/@agentuity/cli/bin/cli.js" > /dev/null 2>&1 || true

# Create symlink
ln -sf ../node_modules/@agentuity/cli/bin/cli.js /tmp/test-symlink/.bun/bin/agentuity

# Run via symlink - Bun.main should resolve to the actual file
result=$(env -u BUN_INSTALL HOME=/tmp/test-symlink bun /tmp/test-symlink/.bun/bin/agentuity 2>/dev/null)
run_test "Symlinked global binary" "global" "$result"

echo ""
echo "----------------------------------------"
echo "TEST 10: bunx execution (local)"
echo "----------------------------------------"

rm -rf /tmp/test-bunx
mkdir -p /tmp/test-bunx/.bun  # Empty global
mkdir -p /tmp/test-bunx/project
mkdir -p /tmp/test-bunx/project/node_modules/@agentuity/cli/bin

result=$(run_scenario_from_path "/tmp/test-bunx" "" "/tmp/test-bunx/project/node_modules/@agentuity/cli/bin/cli.js")
run_test "bunx-style execution (project node_modules)" "local" "$result"

echo ""
echo "----------------------------------------"
echo "TEST 11: XDG-style bun location"
echo "----------------------------------------"

rm -rf /tmp/test-xdg
mkdir -p /tmp/test-xdg/.local/share/bun/node_modules/@agentuity/cli/bin

result=$(run_scenario_from_path "/tmp/test-xdg" "/tmp/test-xdg/.local/share/bun" "/tmp/test-xdg/.local/share/bun/node_modules/@agentuity/cli/bin/cli.js")
run_test "XDG-style bun location with BUN_INSTALL" "global" "$result"

echo ""
echo "----------------------------------------"
echo "TEST 12: Path with spaces"
echo "----------------------------------------"

rm -rf "/tmp/test with spaces"
mkdir -p "/tmp/test with spaces/.bun/node_modules/@agentuity/cli/bin"

result=$(run_scenario_from_path "/tmp/test with spaces" "" "/tmp/test with spaces/.bun/node_modules/@agentuity/cli/bin/cli.js")
run_test "Path with spaces" "global" "$result"

echo ""
echo "----------------------------------------"
echo "TEST 13: Fallback /.bun/ detection"
echo "----------------------------------------"

# Test the fallback that catches /.bun/ anywhere in path
rm -rf /tmp/test-fallback
mkdir -p /tmp/test-fallback/some/random/path/.bun/stuff/node_modules/@agentuity/cli/bin
mkdir -p /tmp/test-fallback/home  # Different home

result=$(run_scenario_from_path "/tmp/test-fallback/home" "/tmp/test-fallback/nonexistent" "/tmp/test-fallback/some/random/path/.bun/stuff/node_modules/@agentuity/cli/bin/cli.js")
run_test "Fallback /.bun/ detection" "global" "$result"

echo ""
echo "========================================"
echo "RESULTS"
echo "========================================"
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

# Cleanup
rm -rf /tmp/test-default-global /tmp/test-custom-bun /tmp/test-legacy /tmp/test-bun-install-global
rm -rf /tmp/test-local /tmp/test-source /tmp/test-nested /tmp/test-different-paths
rm -rf /tmp/test-symlink /tmp/test-bunx /tmp/test-xdg "/tmp/test with spaces" /tmp/test-fallback

if [ $TESTS_FAILED -gt 0 ]; then
    echo -e "${RED}SOME TESTS FAILED${NC}"
    exit 1
else
    echo -e "${GREEN}ALL TESTS PASSED${NC}"
    exit 0
fi
