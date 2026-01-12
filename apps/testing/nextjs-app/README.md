# Next.js + Agentuity Integration Demo

This application demonstrates type-safe integration between Next.js App Router frontend and Agentuity agent backend.

## Architecture

```
nextjs-app/
├── app/                          # Next.js App Router (port 3001)
│   ├── components/
│   │   └── EchoDemo.tsx          # Client component using useAPI hook
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Home page
├── agentuity/                    # Agentuity agent backend (port 3500)
│   ├── src/
│   │   ├── agent/echo/agent.ts   # Echo agent with typed schemas
│   │   ├── api/index.ts          # API routes
│   │   └── generated/routes.ts   # Auto-generated type definitions
│   └── app.ts
├── next.config.ts                # API rewrites to backend
└── tsconfig.json                 # TypeScript path aliases
```

## Key Integration Points

### 1. API Rewrites (next.config.ts)

Next.js rewrites `/api/*` requests to the Agentuity backend:

```typescript
const nextConfig: NextConfig = {
	async rewrites() {
		return [
			{
				source: '/api/:path*',
				destination: 'http://localhost:3500/api/:path*',
			},
		];
	},
};
```

### 2. Type-Safe Routes (tsconfig.json paths)

Path aliases enable importing generated route types:

```json
{
	"paths": {
		"@agentuity/routes": ["./agentuity/src/generated/routes.ts"]
	}
}
```

### 3. Client Component (EchoDemo.tsx)

The `useAPI` hook provides full type inference with the `'use client'` directive:

```tsx
'use client';

import { useAPI, AgentuityProvider } from '@agentuity/react';
import '@agentuity/routes'; // Side-effect import for type augmentation

function EchoDemoInner() {
	// TypeScript knows: input = { message: string }, output = { echo: string, timestamp: string }
	const { data, invoke, isLoading, error } = useAPI('POST /api/echo');

	return <button onClick={() => invoke({ message: 'Hello!' })}>Send Echo</button>;
}

export default function EchoDemo() {
	return (
		<AgentuityProvider>
			<EchoDemoInner />
		</AgentuityProvider>
	);
}
```

### 4. Echo Agent (agent.ts)

Typed agent with input/output schemas:

```typescript
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

export const EchoInput = s.object({
	message: s.string(),
});

export const EchoOutput = s.object({
	echo: s.string(),
	timestamp: s.string(),
});

const agent = createAgent('echo', {
	schema: { input: EchoInput, output: EchoOutput },
	handler: async (ctx, { message }) => ({
		echo: message,
		timestamp: new Date().toISOString(),
	}),
});
```

## Development

```bash
# Install dependencies (from SDK root)
bun install

# Build agent backend (generates routes.ts)
bun run build:agent

# Run both frontend and backend concurrently
bun run dev
```

- Frontend: http://localhost:3001
- Backend: http://localhost:3500
- Workbench: http://localhost:3500/workbench

## Type Safety Flow

1. Agent schemas defined in `agent.ts` using `@agentuity/schema`
2. Build generates `routes.ts` with `declare module '@agentuity/frontend'`
3. Frontend imports `@agentuity/routes` (side-effect import)
4. `useAPI('POST /api/echo')` infers types from RouteRegistry augmentation
5. TypeScript validates `invoke({ message })` and `data.echo` at compile time

## Next.js Specific Notes

- Use `'use client'` directive for components using `useAPI` hook
- The `AgentuityProvider` must wrap any component using Agentuity hooks
- API rewrites only work in development; for production, configure your deployment platform
