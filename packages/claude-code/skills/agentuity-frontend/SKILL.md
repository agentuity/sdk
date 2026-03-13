---
name: agentuity-frontend
description: When building website or app frontends that connect to Agentuity agents and services. Covers @agentuity/react hooks, @agentuity/auth for login flows, @agentuity/frontend for WebRTC and real-time communication, and @agentuity/workbench for the agent testing UI.
version: 1.0.0
---

# Agentuity Frontend Reference

## Package Overview

| Package                | Purpose                                               |
| ---------------------- | ----------------------------------------------------- |
| `@agentuity/react`     | React hooks for calling agents (useAPI, useWebsocket) |
| `@agentuity/frontend`  | Framework-agnostic web utilities                      |
| `@agentuity/auth`      | Authentication (server + client)                      |
| `@agentuity/workbench` | Dev UI for testing agents                             |

## Key Concepts

- Wrap app with `<AgentuityProvider>` (and `<AuthProvider>` if using auth)
- `useAPI('POST /api/chat')` for calling routes that invoke agents (auto-typed, handles loading/error)
- `useWebsocket('/ws/chat')` for real-time communication (auto-reconnect, message queuing)
- `useAuth()` for authentication state
- Auth tokens auto-injected into useAPI and useWebsocket when AuthProvider is in tree
- `baseUrl` prop only needed if frontend is hosted separately from Agentuity
- Server auth via `createAuth()`, `createSessionMiddleware()`, `mountAuthRoutes()` from `@agentuity/auth`

## Documentation Links

| Topic | Link |
| --- | --- |
| React Hooks | https://agentuity.dev/frontend/react-hooks.md |
| Provider Setup | https://agentuity.dev/frontend/provider-setup.md |
| Authentication | https://agentuity.dev/frontend/authentication.md |
| Advanced Hooks | https://agentuity.dev/frontend/advanced-hooks.md |
| RPC Client | https://agentuity.dev/frontend/rpc-client.md |
| Static Rendering | https://agentuity.dev/frontend/static-rendering.md |
| Deployment Scenarios | https://agentuity.dev/frontend/deployment-scenarios.md |
| Workbench | https://agentuity.dev/frontend/workbench.md |

## Common Mistakes

| Mistake                                   | Better Approach            | Why                                             |
| ----------------------------------------- | -------------------------- | ----------------------------------------------- |
| Adding `baseUrl` inside Agentuity project | Omit `baseUrl`             | Auto-detected in full-stack projects            |
| Using `fetch` directly for agents         | Use `useAPI` hook          | Type inference, auth injection, loading states  |
| Manual WebSocket management               | Use `useWebsocket` hook    | Auto-reconnect, auth injection, message queuing |
| Missing AuthProvider                      | Wrap app with AuthProvider | Required for auth token injection               |
| Calling `/agent/<name>` from frontend     | Call `/api/<name>` routes instead | Agents aren't HTTP endpoints — call the API route that wraps the agent |
| Putting secrets in frontend env vars      | Only use `AGENTUITY_PUBLIC_*`, `VITE_*`, or `PUBLIC_*` prefixes | These prefixes are exposed to the browser — never put API keys in them |

## Example

```tsx
import { AgentuityProvider, useAPI } from '@agentuity/react';

function App() {
	return (
		<AgentuityProvider>
			<Chat />
		</AgentuityProvider>
	);
}

function Chat() {
	const { data, invoke, isLoading } = useAPI('POST /api/chat');
	return <button onClick={() => invoke({ message: 'Hello' })}>Send</button>;
}
```

## Environment Variables for Frontend

Only variables with these prefixes are exposed to the browser bundle:
- `AGENTUITY_PUBLIC_*`
- `VITE_*`
- `PUBLIC_*`

**Never put secrets or API keys in these variables.** LLM API keys are not needed anyway — the AI Gateway handles LLM routing server-side.

## When In Doubt, Check the Docs

If you're unsure about any hook, provider, or pattern, **check the documentation first** rather than guessing:

- Full docs: https://agentuity.dev
- LLM-friendly index: https://agentuity.dev/llms.txt
- React Hooks: https://agentuity.dev/frontend/react-hooks.md
