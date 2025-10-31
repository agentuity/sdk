# Secret Detection Feature

## Overview

The CLI now automatically detects when users attempt to store sensitive data (passwords, API keys, tokens, certificates, etc.) as regular environment variables and prompts them to use the secure `secret` commands instead.

## How It Works

### Detection Triggers

The system analyzes both **key names** and **values** to identify potential secrets:

#### Key Name Patterns (case-insensitive)

- Ends with: `_SECRET`, `_KEY`, `_TOKEN`, `_PASSWORD`, `_PRIVATE`, `_CERT`, `_CERTIFICATE`
- Starts with: `SECRET_`, `APIKEY`, `API_KEY`, `JWT`
- Contains: `PASSWORD`, `CREDENTIAL`, `AUTHKEY`

#### Value Patterns

- **JWT tokens**: Standard `eyJ...` format
- **Bearer tokens**: `Bearer <long-token>` format
- **AWS keys**: `AKIA...` or `ASIA...` patterns
- **GitHub tokens**: `ghp_...` or `ghs_...` patterns
- **Long alphanumeric strings**: 32+ characters (likely API keys)
- **PEM certificates**: Contains `BEGIN CERTIFICATE`, `BEGIN PRIVATE KEY`, etc.

#### Exclusions

- UUIDs (standard 8-4-4-4-12 format) are NOT flagged
- Short values (< 8 characters) are NOT flagged
- Numeric-only strings are NOT flagged

## User Experience

### `env set` Command

When a potential secret is detected:

```bash
$ agentuity env set API_KEY sk_live_1234567890abcdef

⚠ The variable 'API_KEY' looks like it should be a secret.
ℹ Secrets should be stored using: agentuity secret set <key> <value>
ℹ This keeps them more secure and properly masked in the cloud.

? Do you still want to store this as a regular environment variable? (y/N)
```

If the user selects **No**:

```
ℹ Cancelled. Use "agentuity secret set" to store this as a secret instead.
```

If the user selects **Yes**, the variable is stored normally.

### `env import` Command

When importing from a file with potential secrets:

```bash
$ agentuity env import .env.production

⚠ Found 3 variable(s) that look like they should be secrets:
ℹ   • DATABASE_PASSWORD
ℹ   • STRIPE_API_KEY
ℹ   • JWT_SECRET

ℹ Secrets should be stored using: agentuity secret import <file>
ℹ This keeps them more secure and properly masked in the cloud.

? Do you still want to import these as regular environment variables? (y/N)
```

## Implementation

### Core Function

`looksLikeSecret(key: string, value: string): boolean`

Located in: [`src/env-util.ts`](../src/env-util.ts)

### Integration Points

1. **[`src/cmd/env/set.ts`](../src/cmd/env/set.ts)**: Checks single key-value pairs before storing
2. **[`src/cmd/env/import.ts`](../src/cmd/env/import.ts)**: Scans all variables in imported file

### Tests

Comprehensive test suite in: [`src/env-util.test.ts`](../src/env-util.test.ts)

Tests cover:

- All key name pattern variations
- All value pattern variations
- Non-secret patterns (false negatives)
- Edge cases (UUIDs, hashes, real-world API keys)

## Benefits

1. **Security**: Prevents accidental exposure of secrets in plain environment variables
2. **Education**: Teaches users about the difference between env vars and secrets
3. **Flexibility**: Users can still override the warning if needed
4. **Smart Detection**: Comprehensive pattern matching catches most common secret types

## Future Enhancements

Potential improvements:

- Add more provider-specific patterns (Azure, GCP, etc.)
- Configurable sensitivity levels
- Allow `.agentignore` style patterns to skip detection for specific keys
- Integration with secret scanning tools like gitleaks or truffleHog
