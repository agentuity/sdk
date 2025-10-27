# Test Scripts

This directory contains test scripts for validating the Agentuity SDK functionality.

## Available Scripts

### validate-dependencies.sh

Validates that all required dependencies for test scripts are installed.

**Usage:**

```bash
# From test-app directory
./scripts/validate-dependencies.sh
```

**Checks for:**

- `curl` (required)
- `jq` (required)
- `dd` (required)
- `md5sum` or `md5` (required)
- `convert` (optional - for ImageMagick tests)

**Example output:**

```
✓ All required dependencies are available!
You can run the test script with:
  ./scripts/test-binary-storage.sh
```

### test-binary-storage.sh

Tests binary object storage to ensure data is not corrupted during upload/download.

**Prerequisites:**

- `jq` installed (for JSON parsing)
- `md5sum` or `md5` available (for checksum verification)
- `bun` installed (for running the test server)
- `.env` file in monorepo root (sdk-mono/.env) with `AGENTUITY_SDK_KEY` configured

**Usage:**

```bash
# From test-app directory
./scripts/test-binary-storage.sh
```

**Note:** The script automatically:

- Checks if the server is running on port 3000
- Starts the server if not running
- Waits for the server to be ready (up to 30 seconds)
- Runs all tests
- Stops the server on exit (only if started by the script)

If the server is already running, it will remain running after the tests complete.

**What it tests:**

- Random binary data (1KB)
- Problematic bytes (null bytes, high bytes: 0x00, 0xFF, 0xFE, etc.)
- MD5 checksum verification
- Byte-by-byte comparison
- Image upload/download (if ImageMagick available)
- Public URL generation

**Expected output:**

```
=========================================
Binary Object Storage Test
=========================================

Step 1: Creating test file with random binary data (1KB)...
✓ Created original.bin (MD5: ...)

Step 2: Creating file with problematic bytes...
✓ Created problematic.bin (MD5: ...)

...

=========================================
ALL TESTS PASSED!
Binary data can be uploaded and downloaded without corruption.
=========================================
```

## Running Tests

### Check Dependencies First

```bash
cd test-app
./scripts/validate-dependencies.sh
```

### All Tests

```bash
cd test-app
./scripts/test-binary-storage.sh
```

### Individual Commands

You can also run individual curl commands from the test script. See [BINARY_STORAGE_TEST.md](../BINARY_STORAGE_TEST.md) for manual testing procedures.

## Troubleshooting

### Missing .env File

Error: `.env file not found in monorepo root (../.env)`

Solution: Create a `.env` file in the monorepo root directory with your API key:

```bash
cd sdk-mono  # Monorepo root
echo "AGENTUITY_SDK_KEY=your-api-key-here" > .env
```

### Server Fails to Start

If the script can't start the server automatically, check the server logs in the temporary directory (path shown in script output).

Common issues:

- Port 3000 already in use by another process
- Build errors in the application
- Missing dependencies
- Missing or invalid `.env` file

Manual test:

```bash
cd test-app
bun run dev
```

### API Returns 500 Errors

If uploads fail with "Internal Server Error" or authentication errors:

- Check that `AGENTUITY_SDK_KEY` is set in `.env` (in monorepo root)
- Verify the API key is valid
- Check server logs for detailed error messages
- Ensure the server is using `bun --env-file=../.env run dev`

### jq Not Installed

Error: `jq: command not found`

Solution:

```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt-get install jq
```

### md5sum Not Available

On macOS, use `md5` instead of `md5sum`. The script should handle this automatically.

## Adding New Scripts

When adding new test scripts:

1. Make them executable: `chmod +x scripts/your-script.sh`
2. Add proper error handling: `set -e`
3. Clean up temporary files: Use `trap` to remove temp files on exit
4. Document usage in this README
5. Test on a clean environment

## Script Standards

- Use bash shebang: `#!/bin/bash`
- Enable error checking: `set -e`
- Use colors for output (GREEN for success, RED for failure)
- Clean up temporary files with trap
- Provide clear error messages
- Exit with non-zero code on failure
