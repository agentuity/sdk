# @agentuity/workbench

React UI components for building agent testing and debugging interfaces. Provides a pre-built workbench UI with chat, schema visualization, and real-time agent interaction.

## Installation

```bash
bun add @agentuity/workbench
```

## Overview

`@agentuity/workbench` provides a complete UI toolkit for testing and interacting with Agentuity agents during development. It includes chat interfaces, schema visualization, and WebSocket-based real-time communication.

## Features

- **Chat Interface**: Pre-built chat component with AI message rendering
- **Schema Visualization**: Display and interact with agent input/output schemas
- **Real-time Communication**: WebSocket-based connection to running agents
- **Theme Support**: Light and dark mode with customizable theming
- **Markdown Rendering**: Code blocks with syntax highlighting

## Quick Start

### Basic Usage

```tsx
import { App, WorkbenchProvider } from '@agentuity/workbench';
import '@agentuity/workbench/styles';

function MyWorkbench() {
	return (
		<WorkbenchProvider>
			<App />
		</WorkbenchProvider>
	);
}
```

### Custom Configuration

```tsx
import { createWorkbench, WorkbenchProvider, Chat } from '@agentuity/workbench';
import '@agentuity/workbench/styles';

const workbench = createWorkbench({
	route: '/workbench',
	headers: {
		Authorization: 'Bearer token',
	},
});

function CustomWorkbench() {
	return (
		<WorkbenchProvider>
			<Chat />
		</WorkbenchProvider>
	);
}
```

### Server-Side Usage

For server components or SSR, import from the server entry point:

```typescript
import { createWorkbench } from '@agentuity/workbench/server';

const workbench = createWorkbench({
	route: '/workbench',
});
```

## Components

### App

The main workbench application component with full UI.

### Chat

Chat interface component for agent conversations.

### Schema

Schema visualization component for displaying agent input/output types.

### StatusIndicator

Connection status indicator showing real-time connectivity.

### WorkbenchProvider

Context provider for workbench state management.

```tsx
import { WorkbenchProvider, useWorkbench } from '@agentuity/workbench';

function MyComponent() {
	const workbench = useWorkbench();
	// Access workbench state and methods
}
```

## Styling

Import styles based on your setup:

```tsx
// For integration into existing apps (minimal styles)
import '@agentuity/workbench/styles';

// For standalone usage (includes all dependencies)
import '@agentuity/workbench/styles-standalone';

// Base styles only
import '@agentuity/workbench/base';
```

## Peer Dependencies

This package requires React 19+ and several Radix UI components. See `package.json` for the complete list.

## License

Apache 2.0
