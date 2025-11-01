# Go-Common ↔ TypeScript Crypto Interoperability Tests

This directory contains cross-language tests to verify byte-level compatibility between the TypeScript crypto/box implementation and the Go agentuity/go-common crypto package.

## Setup

1. Clone the go-common repository:

```bash
cd test-interop
git clone https://github.com/agentuity/go-common.git
```

2. Build the Go test tool:

```bash
go build -o go-crypto-tool main.go
```

3. Run the interop tests:

```bash
bun run test.ts
```

## What Gets Tested

### Test 1: TypeScript Encrypt → Go Decrypt

- Generates P-256 key pair using Node.js crypto
- Encrypts data using TypeScript implementation
- Decrypts using Go implementation
- Verifies byte-exact match

### Test 2: Go Encrypt → TypeScript Decrypt

- Generates P-256 key pair using Go
- Encrypts data using Go implementation
- Decrypts using TypeScript implementation
- Verifies byte-exact match

## Test Data

Each test uses ~250KB of data to ensure multi-frame encryption is tested (frame size = 65519 bytes).

## Success Criteria

✅ Both tests must pass with byte-exact plaintext recovery
✅ No authentication failures
✅ No frame length mismatches
✅ Proper handling of multi-frame streams

## Debugging

If tests fail, check:

1. KDF otherInfo string matches exactly (`"AES-256-GCM"`)
2. Frame length encoding (uint16 big-endian)
3. ECDH shared secret computation
4. GCM AAD (wrappedLen || baseNonce for first frame only)
