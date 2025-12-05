# Agent Guidelines for @agentuity/test-utils

## Package Overview

Internal test utilities package providing shared test helpers across Agentuity SDK packages. **This package is private and never published to npm.**

## Commands

None - this is a source-only package used directly via workspace imports

## Architecture

- **Runtime**: Node.js/Bun (test environment only)
- **Build target**: No build step, imported directly from src/
- **Private**: Marked `"private": true` in package.json
- **Dependencies**: Only @agentuity/core and bun-types

## Structure

```text
src/
├── index.ts         # Main exports
├── mock-logger.ts   # createMockLogger() helper
└── mock-fetch.ts    # mockFetch() helper
```

## Usage in Other Packages

Add to devDependencies only:

```json
{
	"devDependencies": {
		"@agentuity/test-utils": "workspace:*"
	}
}
```

Import in test files:

```typescript
import { createMockLogger, mockFetch } from '@agentuity/test-utils';
```

## Adding New Helpers

When you find test code duplicated across 2+ packages:

1. Add the helper function to `src/`
2. Export it from `src/index.ts`
3. Update README.md with usage example
4. No build step needed - packages import directly from src/

## Important Conventions

- **Never publish** - `"private": true` prevents npm publish
- **Test-only** - Only used in devDependencies, never in dependencies
- **No build** - Packages import source directly via TypeScript
- **Minimal dependencies** - Only core and bun-types
- **Well-documented** - All helpers have JSDoc and examples

## Current Helpers

### `createMockLogger()`

Creates a silent mock Logger for testing.

### `mockFetch(fn)`

Mocks globalThis.fetch, handling Bun's type incompatibility automatically.
