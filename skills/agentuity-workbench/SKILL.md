---
name: agentuity-workbench
description: Setting up and using the Agentuity Workbench for testing agents during development. Use when configuring the workbench dev UI, testing agent inputs and outputs interactively, debugging agent behavior in the browser, or integrating the workbench component into a custom frontend. Triggers on Agentuity workbench setup, agent testing UI, or dev tooling tasks.
license: Apache-2.0
metadata:
  author: agentuity
  version: "1.0.0"
---

# Agentuity Workbench

The Workbench is a built-in development UI for testing your agents interactively. It provides a visual interface to send inputs, see outputs, view schemas, and inspect agent behavior — all without writing test scripts or using curl.

## How It Works

When you run `bun run dev`, the Workbench is automatically available. It connects to your running dev server and discovers all registered agents and their schemas.

The Workbench shows:
- **Agent list** — all agents discovered from `src/agent/`
- **Schema viewer** — input/output schemas rendered as forms
- **Chat interface** — send requests and see responses in real time
- **JSON editor** — edit raw JSON input for precise testing
- **Connection status** — live indicator showing dev server connectivity

## Setup

The Workbench is included automatically in new Agentuity projects. No additional setup is needed — just run:

```bash
bun run dev
```

The terminal output shows the URL where the Workbench is available (typically at the `/workbench` route).

### Server-Side Configuration

The Workbench is configured through `createWorkbench` from `@agentuity/workbench`:

```typescript
import { createWorkbench } from '@agentuity/workbench';

const workbench = createWorkbench({
  route: '/workbench',    // URL path (default: '/workbench')
  headers: {},            // Custom headers for workbench requests
});
```

The runtime automatically creates workbench routes when running in dev mode:

- **Metadata route** — returns agent schemas and configuration
- **Execution route** — proxies requests to agents
- **WebSocket route** — real-time communication for the UI

### Custom Headers

If your agents require authentication or custom headers, pass them to the workbench:

```typescript
const workbench = createWorkbench({
  headers: {
    'Authorization': 'Bearer dev-token',
    'X-Custom-Header': 'value',
  },
});
```

## Using the Workbench

### Testing an Agent

1. Open the Workbench URL in your browser
2. Select an agent from the sidebar
3. The input schema is rendered as a form — fill in the fields
4. Click "Send" to invoke the agent
5. The response appears in the chat panel

### JSON Mode

For complex inputs or testing edge cases, switch to the JSON editor:

- Edit raw JSON input directly
- Paste test payloads from other sources
- Test malformed inputs to verify error handling

### Schema Inspection

The Workbench renders agent schemas visually, showing:
- Required vs optional fields
- Field types and enums
- Nested object structures
- Array types

This helps verify that your schema definitions match your expectations before writing frontend code.

## React Components

The Workbench is built with React and exports components that can be embedded in custom UIs:

```typescript
import {
  App,                    // Full workbench application
  Chat,                   // Chat panel component
  Schema,                 // Schema viewer component
  StatusIndicator,        // Connection status indicator
  WorkbenchProvider,      // Context provider
  useWorkbench,           // Hook for workbench state
  createWorkbench,        // Server-side config
} from '@agentuity/workbench';
```

### Embedding in a Custom UI

Wrap your components with `WorkbenchProvider`:

```tsx
import { WorkbenchProvider, Chat, Schema } from '@agentuity/workbench';

function CustomDevUI() {
  return (
    <WorkbenchProvider>
      <div className="flex">
        <Schema />
        <Chat />
        <StatusIndicator />
      </div>
    </WorkbenchProvider>
  );
}
```

### Auth Headers

If your dev environment requires authentication, provide a header function:

```tsx
import { WorkbenchProvider, type GetAuthHeaders } from '@agentuity/workbench';

const getAuthHeaders: GetAuthHeaders = async () => ({
  'Authorization': 'Bearer my-dev-token',
});

function App() {
  return (
    <WorkbenchProvider getAuthHeaders={getAuthHeaders}>
      {/* ... */}
    </WorkbenchProvider>
  );
}
```

## Development Workflow

The Workbench fits into the standard development loop:

1. **Write agent** — create/modify agent in `src/agent/`
2. **Dev server** — `bun run dev` starts with hot reload
3. **Test in Workbench** — open browser, send test inputs
4. **See logs** — structured logs appear in terminal via `ctx.logger`
5. **Iterate** — edit agent code, Workbench picks up changes automatically

### When to Use the Workbench vs Other Testing

| Approach | Best For |
|---|---|
| **Workbench** | Interactive exploration, manual testing, schema verification, quick iteration |
| **Integration tests** | Automated regression testing, CI/CD pipelines |
| **Evals** | Quality metrics, LLM output evaluation |
| **curl / httpie** | Quick one-off requests, scripting |

## Troubleshooting

### Workbench Not Loading

- Verify `bun run dev` is running and check the terminal for the URL
- Ensure you're accessing the correct port
- Check browser console for connection errors

### Agent Not Appearing

- Confirm the agent file exports a `createAgent` result as the default export
- Check that the file is in `src/agent/<name>/index.ts`
- Look for build errors in the terminal

### Schema Not Updating

- The Workbench fetches schemas on load — refresh the browser
- If using hot reload, the dev server should pick up changes automatically
- Check that your schema uses `s.object()` wrapper (bare objects won't work)
