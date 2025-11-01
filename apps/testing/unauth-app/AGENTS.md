# Agent Guidelines for auth-app

## Commands

- **Build**: `bun run build` (runs bundler from parent monorepo)
- **Dev server**: `bun run dev` (runs built app from .agentuity/app.js)
- **Test**: `bun run test` (tests unauthenticated error handling)
- **Install**: `bun install`

## Purpose

This app tests that unauthenticated storage service access returns proper error responses.

## Testing

- **Setup**: Kill any existing server with `lsof -ti:3500 | xargs kill -9 2>/dev/null || true`
- **Server**: Start with `bun run .agentuity/app.js &> /tmp/auth-server.log & sleep 5`
- **Cleanup**: After tests, kill with `lsof -ti:3500 | xargs kill -9 2>/dev/null || true`
- **Expected**: All endpoints should return HTTP 501 with UnauthenticatedError message
- **No AGENTUITY_SDK_KEY**: This app intentionally does not set authentication to test error handling
