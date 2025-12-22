# Agent Guidelines for @agentuity/auth

## Package Overview

Authentication helpers for identity providers (Clerk, WorkOS, etc.). Provides React components and Hono middleware.

## Commands

- **Build**: `bun run build`
- **Typecheck**: `bun run typecheck`
- **Test**: `bun test`
- **Clean**: `bun run clean`

## Architecture

- **Runtime**: Dual-target (browser for client, Bun/Node for server)
- **Dependencies**: `@agentuity/react` (client), `@agentuity/runtime` (server)
- **Peer deps**: Provider SDKs are optional peers

## Structure

```
src/
├── index.ts        # Core type exports
├── types.ts        # AgentuityAuth, AgentuityAuthUser interfaces
└── clerk/          # (or other provider)
    ├── index.ts    # Re-exports
    ├── client.tsx  # React component
    └── server.ts   # Hono middleware
```

## Code Conventions

- **Naming**: `Agentuity<Provider>` for components, `createMiddleware()` for server
- **Type safety**: Use generics `AgentuityAuth<TUser, TRaw>`
- **Tree shaking**: Import paths like `@agentuity/auth/clerk`
- **Env vars**: Support `AGENTUITY_PUBLIC_<PROVIDER>_*` and standard provider names

## Key Patterns

```typescript
// Hono module augmentation (required per provider)
declare module 'hono' {
	interface ContextVariableMap {
		auth: AgentuityAuth<User, ClerkJWTPayload>;
	}
}

// Error handling - include setup instructions
if (!secretKey) {
	console.error('[Provider] SECRET_KEY not set. Add to .env');
	throw new Error('Provider secret key required');
}
```

## Adding New Providers

See [docs/adding-providers.md](docs/adding-providers.md) for full implementation guide.

## Publishing

1. Run build, typecheck, test
2. Publish **after** `@agentuity/react` and `@agentuity/runtime`
