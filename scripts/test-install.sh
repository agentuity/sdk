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

test_current_os() {
  print_header "Testing on Current OS"
  
  print_info "Creating temporary directory..."
  tmpdir=$(mktemp -d 2>/dev/null || mktemp -d -t tmp)
  trap 'rm -rf "$tmpdir"' EXIT
  
  print_info "Running install script..."
  if ! HOME="$tmpdir" "$INSTALL_SCRIPT" -y > "$tmpdir/install.log" 2>&1; then
    print_error "Install script failed"
    cat "$tmpdir/install.log"
    return 1
  fi
  
  print_success "Install script completed"
  
  print_info "Testing agentuity version..."
  if ! PATH="$tmpdir/.agentuity/bin:$PATH" agentuity --version > "$tmpdir/version.log" 2>&1; then
    print_error "agentuity --version command failed"
    cat "$tmpdir/version.log"
    return 1
  fi
  
  version=$(PATH="$tmpdir/.agentuity/bin:$PATH" agentuity --version)
  print_success "agentuity version: $version"
  
  rm -rf "$tmpdir"
  trap - EXIT
  return 0
}

test_docker_image() {
  os_name="$1"
  image="$2"
  setup_cmd="$3"
  platform="${4:-}"
  
  print_header "Testing on $os_name"
  
  # Build docker run command
  docker_cmd="docker run --rm"
  if [ -n "$platform" ]; then
    docker_cmd="$docker_cmd --platform $platform"
  fi
  docker_cmd="$docker_cmd -v \"$REPO_ROOT:/app\" -w /app $image"
  
  # Create test script for container
  test_script='
set -e
# Setup package manager and install dependencies if needed
'"$setup_cmd"'

# Ensure CI env var is set
export CI=true

# Run install script
if ! ./install.sh -y > /tmp/install.log 2>&1; then
  echo "Install failed:"
  cat /tmp/install.log
  exit 1
fi

# Test that binary was installed
if [ ! -f "$HOME/.agentuity/bin/agentuity" ]; then
  echo "Binary not found at $HOME/.agentuity/bin/agentuity"
  exit 1
fi

# Test version command
if ! "$HOME/.agentuity/bin/agentuity" --version > /tmp/version.log 2>&1; then
  echo "Version command failed:"
  cat /tmp/version.log
  exit 1
fi

# Print version
version=$("$HOME/.agentuity/bin/agentuity" --version)
echo "SUCCESS: agentuity version $version"
'
  
  print_info "Running test in container..."
  log_file="/tmp/test-$(echo "$os_name" | tr ' ' '-').log"
  if ! eval "$docker_cmd sh -c '$test_script'" > "$log_file" 2>&1; then
    print_error "$os_name test failed"
    cat "$log_file"
    return 1
  fi
  
  # Extract version from output
  version=$(grep "SUCCESS:" "$log_file" | sed 's/.*version //')
  print_success "$os_name test passed (version: $version)"
  rm -f "$log_file"
  return 0
}

# Main execution
main() {
  print_header "Agentuity Install Script Test Suite"
  
  total=0
  passed=0
  failed=0
  skipped=0
  
  # Check if install script exists
  if [ ! -f "$INSTALL_SCRIPT" ]; then
    print_error "Install script not found: $INSTALL_SCRIPT"
    exit 1
  fi
  
  print_success "Found install script: $INSTALL_SCRIPT"
  
  # Test current OS
  total=$((total + 1))
  if test_current_os; then
    passed=$((passed + 1))
  else
    failed=$((failed + 1))
  fi
  
  # Check if Docker is available
  if ! command -v docker >/dev/null 2>&1; then
    print_error "Docker not found, skipping container tests"
    skipped=4
  else
    # Test Alpine Linux (uses musl-native binary)
    # TODO: Will fail until musl binaries are published (404 error)
    skipped=$((skipped + 1))
    total=$((total - 1))
    # print_info "Testing Alpine with musl-native binary (may 404 until published)..."
    # if test_docker_image "Alpine Linux" "alpine:latest" ""; then
    #   passed=$((passed + 1))
    # else
    #   print_info "Alpine test failed (likely 404 - musl binaries not yet published)"
    #   skipped=$((skipped + 1))
    #   total=$((total - 1))
    # fi
    
    # Test Debian
    total=$((total + 1))
    if test_docker_image "Debian" "debian:latest" "apt-get update -qq && apt-get install -y -qq curl unzip > /dev/null 2>&1"; then
      passed=$((passed + 1))
    else
      failed=$((failed + 1))
    fi
    
    # Test Ubuntu
    total=$((total + 1))
    if test_docker_image "Ubuntu" "ubuntu:latest" "apt-get update -qq && apt-get install -y -qq curl unzip > /dev/null 2>&1"; then
      passed=$((passed + 1))
    else
      failed=$((failed + 1))
    fi
    
    # Test Arch Linux (amd64 only as arm64 image doesn't exist)
    total=$((total + 1))
    arch=$(uname -m)
    if [ "$arch" = "x86_64" ]; then
      if test_docker_image "Arch Linux" "archlinux:latest" "pacman -Sy --noconfirm curl unzip > /dev/null 2>&1"; then
        passed=$((passed + 1))
      else
        failed=$((failed + 1))
      fi
    else
      print_info "Skipping Arch Linux (requires amd64 platform, current: $arch)"
      skipped=$((skipped + 1))
    fi
  fi
  
  # Print summary
  print_header "Test Summary"
  printf "Total:   %d\n" "$total"
  printf "${GREEN}Passed:  %d${NC}\n" "$passed"
  if [ "$failed" -gt 0 ]; then
    printf "${RED}Failed:  %d${NC}\n" "$failed"
  else
    printf "Failed:  %d\n" "$failed"
  fi
  if [ "$skipped" -gt 0 ]; then
    printf "${YELLOW}Skipped: %d${NC}\n" "$skipped"
  fi
  printf "\n"
  
  if [ "$failed" -gt 0 ]; then
    print_error "Some tests failed"
    exit 1
  else
    print_success "All tests passed!"
    exit 0
  fi
}

main "$@"
