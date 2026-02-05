# Agent Guidelines for @agentuity/frontend

## Package Overview

Framework-agnostic web utilities for building Agentuity frontend applications. Works across React, Svelte, Vue, and other frameworks without any framework dependencies.

## Commands

- **Build**: `bun run build` (compiles for browser target)
- **Typecheck**: `bun run typecheck`
- **Clean**: `bun run clean`

## Architecture

- **Runtime**: Browser only (uses fetch, WebSocket, EventSource)
- **Build target**: Browser with ESNext
- **Dependencies**: `@agentuity/core` only
- **No framework dependencies**: Pure TypeScript

## Structure

```text
src/
├── index.ts              # Main exports
├── types.ts              # RouteRegistry, WebSocketRouteRegistry, SSERouteRegistry, RPCRouteRegistry
├── url.ts                # buildUrl, defaultBaseUrl
├── reconnect.ts          # createReconnectManager (exponential backoff)
├── websocket-manager.ts  # WebSocketManager class
├── eventstream-manager.ts # EventStreamManager class (SSE)
├── client/               # Type-safe API client (createClient)
└── analytics/            # getAnalytics, track, getVisitorId, isOptedOut
```

## Code Conventions

- **Framework-agnostic** - No React/Svelte/Vue dependencies
- **TypeScript generics** - Heavy use of generics for type safety
- **Pure functions** - All utilities are pure functions where possible
- **Browser APIs** - Uses standard browser APIs only

## Important Patterns

### Route Registries

Types are augmented by generated code:

```typescript
declare module '@agentuity/frontend' {
	export interface RouteRegistry {
		'GET /users': { outputSchema: typeof usersSchema };
	}
	export interface WebSocketRouteRegistry {
		/* ... */
	}
	export interface SSERouteRegistry {
		/* ... */
	}
	export interface RPCRouteRegistry {
		/* ... */
	}
}
```

### Connection Managers

`WebSocketManager` and `EventStreamManager` provide auto-reconnection with exponential backoff. Used internally by `@agentuity/react` hooks.

## Key Exports

- **URL**: `buildUrl`, `defaultBaseUrl`
- **Reconnect**: `createReconnectManager`
- **Managers**: `WebSocketManager`, `EventStreamManager`
- **Client**: `createClient`
- **Analytics**: `getAnalytics`, `track`, `getVisitorId`, `isOptedOut`, `setOptOut`
- **Types**: `RouteRegistry`, `WebSocketRouteRegistry`, `SSERouteRegistry`, `RPCRouteRegistry`

## Publishing

1. Run `bun run build`
2. Verify no Node.js APIs in output
3. Must publish **after** @agentuity/core
