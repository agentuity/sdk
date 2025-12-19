# Agent Guidelines for @agentuity/frontend

## Package Overview

Generic web utilities for building Agentuity frontend applications. Provides framework-agnostic utilities that can be used across React, Svelte, Vue, and other frontend frameworks.

## Commands

- **Build**: `bun run build` (compiles for browser target)
- **Typecheck**: `bun run typecheck` (runs TypeScript type checking)
- **Clean**: `bun run clean` (removes dist/)

## Architecture

- **Runtime**: Browser only (uses browser APIs like fetch, WebSocket, EventSource)
- **Build target**: Browser with ESNext
- **Dependencies**: Requires `@agentuity/core` (workspace dependency)
- **No framework dependencies**: Pure JavaScript/TypeScript with no React/Svelte/Vue dependencies

## Structure

```text
src/
├── index.ts           # Main entry point
├── env.ts             # Environment variable helpers
├── url.ts             # URL building utilities
├── serialization.ts   # JSON serialization helpers
├── reconnect.ts       # Exponential backoff reconnection logic
├── types.ts           # Type definitions for route registries
└── memo.ts            # JSON equality utilities
```

## Code Style

- **Framework-agnostic** - No framework-specific dependencies (React, Svelte, etc.)
- **TypeScript generics** - Heavy use of generics for type safety
- **Pure functions** - All utilities are pure functions where possible
- **Browser APIs** - Uses standard browser APIs (fetch, WebSocket, EventSource)

## Important Conventions

- **No framework dependencies** - This package must remain framework-agnostic
- **Type inference** - Route types are inferred from generated types (RouteRegistry)
- **Base URL** - Defaults to current origin if not provided
- **WebSocket protocol** - Auto-converts http:// to ws:// and https:// to wss://
- **Serialization** - Automatically handles JSON serialization/deserialization

## Utilities

### URL Building

- `buildUrl()` - Construct URLs with paths, subpaths, and query parameters
- `defaultBaseUrl` - Default base URL from environment or window.location.origin

### Reconnection Manager

- `createReconnectManager()` - Exponential backoff reconnection logic with jitter
- Configurable threshold, delays, and retry strategies

### Environment

- `getProcessEnv()` - Cross-platform environment variable access (process.env, import.meta.env)

### Serialization

- `deserializeData()` - Safe JSON deserialization with fallback
- `jsonEqual()` - JSON-based equality check for memoization

## Testing

- Test with Bun test runner
- Mock browser APIs where needed (fetch, WebSocket, EventSource)
- Ensure all utilities work without framework dependencies

## Publishing Checklist

1. Run `bun run build` to compile for browser
2. Verify `dist/` contains browser-compatible code (no Node.js APIs)
3. Ensure no framework-specific dependencies are added
4. Must publish **after** @agentuity/core
