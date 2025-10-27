# API Error Handling

The `APIClient` class automatically handles various error conditions returned by the Agentuity API.

## Error Response Format

API errors follow this standard format:

```json
{
	"success": false,
	"code": "ERROR_CODE",
	"message": "Human-readable error message",
	"details": {}
}
```

## Development Mode / Version Check Bypass

For local development and testing, version checks can be bypassed using multiple methods (in priority order):

### 1. CLI Flag (Highest Priority, Hidden)

```bash
agentuity --skip-version-check auth login
```

### 2. Environment Variable

```bash
export AGENTUITY_SKIP_VERSION_CHECK=1
agentuity auth login
```

### 3. Profile/Config Override

Add to your profile YAML file (e.g., `~/.config/agentuity/dev.yaml`):

```yaml
name: 'dev'
overrides:
   api_url: https://api.agentuity.io
   app_url: https://app.agentuity.io
   skip_version_check: true
```

### 4. Automatic Detection (Lowest Priority)

Version checks are automatically skipped when:

- Version is `"dev"` in package.json
- Version starts with `"0.0."` (pre-release versions)

**Important:** Skipping the version check only prevents the CLI from showing the upgrade error. If the API server enforces version requirements server-side (returns 409 status), the request will still fail. This is intended behavior to ensure API compatibility.

## Handled Error Codes

### UPGRADE_REQUIRED

When the CLI version is outdated or incompatible with the API, the server returns:

```json
{
	"success": false,
	"code": "UPGRADE_REQUIRED",
	"message": "Please upgrade to the latest version of the CLI. Instructions at https://agentuity.dev/CLI/installation"
}
```

**Behavior:**

- Throws `UpgradeRequiredError` (extends `Error`)
- Commands should catch this and display a helpful upgrade message
- Exits with code 1

**Example handling:**

```typescript
import { UpgradeRequiredError } from '@agentuity/cli';

try {
	await apiCall();
} catch (error) {
	if (error instanceof UpgradeRequiredError) {
		logger.error('⚠ CLI Upgrade Required');
		logger.error(error.message);
		logger.error('Visit: https://agentuity.dev/CLI/installation');
		process.exit(1);
	}
	throw error;
}
```

## Generic Error Handling

For other API errors:

1. If the response includes a `message` field, it's thrown as `Error(message)`
2. Otherwise, throws `Error("API error: {status} {statusText}")`

## Debug Mode

Set `DEBUG=1` environment variable to see detailed error information:

```bash
DEBUG=1 agentuity auth login
```

This will print:

- Request URL
- HTTP method
- Status code and text
- Request headers
- Response body
