#!/bin/bash

# Validate that all required dependencies for test scripts are available

echo "Validating test script dependencies..."
echo ""

ALL_OK=true

# Check for required commands
check_command() {
  local cmd=$1
  local required=$2
  
  if command -v "$cmd" &> /dev/null; then
    echo "✓ $cmd is installed"
  else
    if [ "$required" = "required" ]; then
      echo "✗ $cmd is NOT installed (REQUIRED)"
      ALL_OK=false
    else
      echo "⚠ $cmd is NOT installed (optional)"
    fi
  fi
}

echo "Required commands:"
check_command "curl" "required"
check_command "jq" "required"
check_command "dd" "required"

# Check for md5 or md5sum
if command -v md5sum &> /dev/null; then
  echo "✓ md5sum is installed"
elif command -v md5 &> /dev/null; then
  echo "✓ md5 is installed (macOS)"
else
  echo "✗ md5sum or md5 is NOT installed (REQUIRED)"
  ALL_OK=false
fi

echo ""
echo "Optional commands:"
check_command "convert" "optional"  # ImageMagick

echo ""

if [ "$ALL_OK" = true ]; then
  echo "========================================="
  echo "✓ All required dependencies are available!"
  echo "========================================="
  echo ""
  echo "You can run the test script with:"
  echo "  ./scripts/test-binary-storage.sh"
  echo ""
  exit 0
else
  echo "========================================="
  echo "✗ Some required dependencies are missing"
  echo "========================================="
  echo ""
  echo "Install missing dependencies:"
  echo ""
  echo "macOS:"
  echo "  brew install jq"
  echo ""
  echo "Ubuntu/Debian:"
  echo "  sudo apt-get install jq coreutils"
  echo ""
  exit 1
fi
