#!/bin/sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALL_SCRIPT="$REPO_ROOT/install.sh"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
  printf "\n${BLUE}╭─────────────────────────────────────────────────────╮${NC}\n"
  printf "${BLUE}│${NC} %-50s ${BLUE} │${NC}\n" "$1"
  printf "${BLUE}╰─────────────────────────────────────────────────────╯${NC}\n\n"
}

print_success() {
  printf "${GREEN}✓${NC} %s\n" "$1"
}

print_error() {
  printf "${RED}✗${NC} %s\n" "$1"
}

print_info() {
  printf "${YELLOW}ℹ${NC} %s\n" "$1"
}

cleanup_containers() {
  for container in bun-test-no-bun bun-test-old-bun bun-test-decline-install bun-test-decline-upgrade; do
    if docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
      docker rm -f "$container" >/dev/null 2>&1 || true
    fi
  done
}

test_no_bun_ci_mode() {
  print_header "Test: No Bun (CI Mode - Auto Install)"
  
  container_name="bun-test-no-bun"
  
  print_info "Starting Debian container..."
  docker run -d --name "$container_name" debian:latest sleep infinity >/dev/null
  
  print_info "Installing curl and unzip..."
  docker exec "$container_name" apt-get update -qq >/dev/null 2>&1
  docker exec "$container_name" apt-get install -y -qq curl unzip >/dev/null 2>&1
  
  print_info "Copying install script..."
  docker cp "$INSTALL_SCRIPT" "$container_name:/tmp/install.sh"
  
  print_info "Running install script in CI mode (should auto-install Bun)..."
  if ! docker exec -e CI=true "$container_name" sh /tmp/install.sh >/dev/null 2>&1; then
    print_error "Install script failed in CI mode"
    docker rm -f "$container_name" >/dev/null 2>&1
    return 1
  fi
  
  print_info "Verifying Bun was auto-installed..."
  if ! docker exec "$container_name" bash -c 'export PATH="$HOME/.bun/bin:$PATH" && bun --version' >/dev/null 2>&1; then
    print_error "Bun was not auto-installed in CI mode"
    docker rm -f "$container_name" >/dev/null 2>&1
    return 1
  fi
  
  print_info "Verifying agentuity was installed..."
  if ! docker exec "$container_name" test -f /root/.agentuity/bin/agentuity; then
    print_error "Agentuity binary not found"
    docker rm -f "$container_name" >/dev/null 2>&1
    return 1
  fi
  
  print_success "Successfully auto-installed Bun in CI mode and completed installation"
  docker rm -f "$container_name" >/dev/null 2>&1
  return 0
}

test_bun_install_prompt() {
  print_header "Test: Bun Install Prompt (Accept)"
  
  container_name="bun-test-no-bun"
  
  print_info "Starting Debian container..."
  docker run -d --name "$container_name" debian:latest sleep infinity >/dev/null
  
  print_info "Installing curl and unzip..."
  docker exec "$container_name" apt-get update -qq >/dev/null 2>&1
  docker exec "$container_name" apt-get install -y -qq curl unzip >/dev/null 2>&1
  
  print_info "Copying install script..."
  docker cp "$INSTALL_SCRIPT" "$container_name:/tmp/install.sh"
  
  print_info "Running install script with yes to Bun install..."
  if ! docker exec -e CI=true "$container_name" bash -c 'printf "y\n" | script -qec "/tmp/install.sh" /dev/null' >/dev/null 2>&1; then
    print_error "Install script failed"
    docker rm -f "$container_name" >/dev/null 2>&1
    return 1
  fi
  
  print_info "Verifying Bun was installed..."
  if ! docker exec "$container_name" bash -c 'export PATH="$HOME/.bun/bin:$PATH" && bun --version' >/dev/null 2>&1; then
    print_error "Bun was not installed correctly"
    docker rm -f "$container_name" >/dev/null 2>&1
    return 1
  fi
  
  print_info "Verifying agentuity was installed..."
  if ! docker exec "$container_name" test -f /root/.agentuity/bin/agentuity; then
    print_error "Agentuity binary not found - installation did not continue after Bun install"
    docker rm -f "$container_name" >/dev/null 2>&1
    return 1
  fi
  
  print_success "Successfully installed Bun and continued with agentuity installation"
  docker rm -f "$container_name" >/dev/null 2>&1
  return 0
}

test_bun_upgrade_prompt() {
  print_header "Test: Bun Upgrade Prompt (Accept)"
  
  container_name="bun-test-old-bun"
  
  print_info "Starting Debian container..."
  docker run -d --name "$container_name" debian:latest sleep infinity >/dev/null
  
  print_info "Installing curl and unzip..."
  docker exec "$container_name" apt-get update -qq >/dev/null 2>&1
  docker exec "$container_name" apt-get install -y -qq curl unzip >/dev/null 2>&1
  
  print_info "Installing old Bun version 1.3.0..."
  docker exec "$container_name" bash -c 'curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.0"' >/dev/null 2>&1
  
  print_info "Copying install script..."
  docker cp "$INSTALL_SCRIPT" "$container_name:/tmp/install.sh"
  
  print_info "Running install script with yes to Bun upgrade..."
  if ! docker exec -e CI=true "$container_name" bash -c 'export PATH="$HOME/.bun/bin:$PATH" && printf "y\n" | script -qec "/tmp/install.sh" /dev/null' >/dev/null 2>&1; then
    print_error "Failed to upgrade Bun and install"
    docker rm -f "$container_name" >/dev/null 2>&1
    return 1
  fi
  
  print_info "Verifying Bun was upgraded..."
  bun_version=$(docker exec "$container_name" bash -c 'export PATH="$HOME/.bun/bin:$PATH" && bun --version' 2>/dev/null)
  if [ "$bun_version" = "1.3.0" ]; then
    print_error "Bun was not upgraded (still at 1.3.0)"
    docker rm -f "$container_name" >/dev/null 2>&1
    return 1
  fi
  
  print_success "Successfully prompted and upgraded Bun from 1.3.0 to $bun_version"
  docker rm -f "$container_name" >/dev/null 2>&1
  return 0
}

test_decline_bun_install() {
  print_header "Test: Decline Bun Install"
  
  container_name="bun-test-decline-install"
  
  print_info "Starting Debian container..."
  docker run -d --name "$container_name" debian:latest sleep infinity >/dev/null
  
  print_info "Installing curl and unzip..."
  docker exec "$container_name" apt-get update -qq >/dev/null 2>&1
  docker exec "$container_name" apt-get install -y -qq curl unzip >/dev/null 2>&1
  
  print_info "Copying install script..."
  docker cp "$INSTALL_SCRIPT" "$container_name:/tmp/install.sh"
  
  print_info "Running install script with no to Bun install (should fail)..."
  if docker exec "$container_name" bash -c 'printf "n\n" | script -qec "/tmp/install.sh" /dev/null' >/dev/null 2>&1; then
    print_error "Expected install to fail when declining Bun install"
    docker rm -f "$container_name" >/dev/null 2>&1
    return 1
  fi
  
  print_success "Correctly failed when user declined Bun install"
  docker rm -f "$container_name" >/dev/null 2>&1
  return 0
}

test_decline_bun_upgrade() {
  print_header "Test: Decline Bun Upgrade"
  
  container_name="bun-test-decline-upgrade"
  
  print_info "Starting Debian container..."
  docker run -d --name "$container_name" debian:latest sleep infinity >/dev/null
  
  print_info "Installing curl and unzip..."
  docker exec "$container_name" apt-get update -qq >/dev/null 2>&1
  docker exec "$container_name" apt-get install -y -qq curl unzip >/dev/null 2>&1
  
  print_info "Installing old Bun version 1.3.0..."
  docker exec "$container_name" bash -c 'curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.0"' >/dev/null 2>&1
  
  print_info "Copying install script..."
  docker cp "$INSTALL_SCRIPT" "$container_name:/tmp/install.sh"
  
  print_info "Running install script with no to Bun upgrade (should fail)..."
  if docker exec "$container_name" bash -c 'export PATH="$HOME/.bun/bin:$PATH" && printf "n\n" | script -qec "/tmp/install.sh" /dev/null' >/dev/null 2>&1; then
    print_error "Expected install to fail when declining Bun upgrade"
    docker rm -f "$container_name" >/dev/null 2>&1
    return 1
  fi
  
  print_success "Correctly failed when user declined Bun upgrade"
  docker rm -f "$container_name" >/dev/null 2>&1
  return 0
}

# Main execution
main() {
  print_header "Bun Version Check Test Suite"
  
  total=0
  passed=0
  failed=0
  
  # Check if install script exists
  if [ ! -f "$INSTALL_SCRIPT" ]; then
    print_error "Install script not found: $INSTALL_SCRIPT"
    exit 1
  fi
  
  print_success "Found install script: $INSTALL_SCRIPT"
  
  # Check if Docker is available
  if ! command -v docker >/dev/null 2>&1; then
    print_error "Docker not found, cannot run Bun check tests"
    exit 1
  fi
  
  # Cleanup any existing test containers
  print_info "Cleaning up any existing test containers..."
  cleanup_containers
  
  # Test 1: No Bun in CI mode
  total=$((total + 1))
  if test_no_bun_ci_mode; then
    passed=$((passed + 1))
  else
    failed=$((failed + 1))
  fi
  
  # Test 2: Bun install prompt (accept)
  total=$((total + 1))
  if test_bun_install_prompt; then
    passed=$((passed + 1))
  else
    failed=$((failed + 1))
  fi
  
  # Test 3: Bun upgrade prompt (accept)
  total=$((total + 1))
  if test_bun_upgrade_prompt; then
    passed=$((passed + 1))
  else
    failed=$((failed + 1))
  fi
  
  # Test 4: Decline Bun install
  total=$((total + 1))
  if test_decline_bun_install; then
    passed=$((passed + 1))
  else
    failed=$((failed + 1))
  fi
  
  # Test 5: Decline Bun upgrade
  total=$((total + 1))
  if test_decline_bun_upgrade; then
    passed=$((passed + 1))
  else
    failed=$((failed + 1))
  fi
  
  # Cleanup
  print_info "Cleaning up test containers..."
  cleanup_containers
  
  # Print summary
  print_header "Test Summary"
  printf "Total:   %d\n" "$total"
  printf "${GREEN}Passed:  %d${NC}\n" "$passed"
  if [ "$failed" -gt 0 ]; then
    printf "${RED}Failed:  %d${NC}\n" "$failed"
  else
    printf "Failed:  %d\n" "$failed"
  fi
  printf "\n"
  
  if [ "$failed" -gt 0 ]; then
    print_error "Some tests failed"
    exit 1
  else
    print_success "All Bun check tests passed!"
    exit 0
  fi
}

main "$@"
