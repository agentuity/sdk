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
├── url.ts                # buildUrl, defaultBaseUrl
├── reconnect.ts          # createReconnectManager (exponential backoff)
├── websocket-manager.ts  # WebSocketManager class
├── eventstream-manager.ts # EventStreamManager class (SSE)
├── webrtc-manager.ts     # WebRTCManager class
├── analytics.ts          # getAnalytics, track, getVisitorId, isOptedOut
└── memo.ts               # jsonEqual
```

## Code Conventions

- **Framework-agnostic** - No React/Svelte/Vue dependencies
- **TypeScript generics** - Heavy use of generics for type safety
- **Pure functions** - All utilities are pure functions where possible
- **Browser APIs** - Uses standard browser APIs only

## Connection Managers

`WebSocketManager` and `EventStreamManager` provide auto-reconnection with exponential backoff.

## Key Exports

- **URL**: `buildUrl`, `defaultBaseUrl`
- **Reconnect**: `createReconnectManager`
- **Managers**: `WebSocketManager`, `EventStreamManager`, `WebRTCManager`
- **Analytics**: `getAnalytics`, `track`, `getVisitorId`, `isOptedOut`, `setOptOut`
- **Utilities**: `jsonEqual`, `deserializeData`, `getProcessEnv`

## Publishing

1. Run `bun run build`
2. Verify no Node.js APIs in output
3. Must publish **after** @agentuity/core
