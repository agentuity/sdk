# Web Folder Guide

This folder contains your React-based web application that communicates with your Agentuity agents.

## Directory Structure

Required files:
- **App.tsx** (required) - Main React application component
- **frontend.tsx** (required) - Frontend entry point with client-side rendering
- **index.html** (required) - HTML template
- **public/** (optional) - Static assets (images, CSS, JS files)

Example structure:
```
src/web/
├── App.tsx
├── frontend.tsx
├── index.html
└── public/
    ├── styles.css
    ├── logo.svg
    └── script.js
```

## Creating the Web App

### App.tsx - Main Component

```typescript
import { AgentuityProvider, useAgent } from '@agentuity/react';
import { useState } from 'react';

export function App() {
	const [name, setName] = useState('World');
	const { run, running, data: greeting } = useAgent('hello');

	return (
		<div style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
			<AgentuityProvider>
				<h1>Welcome to Agentuity</h1>
				
				<input
					type="text"
					value={name}
					onChange={(e) => setName(e.target.value)}
					disabled={running}
				/>
				
				<button 
					onClick={() => run({ name })}
					disabled={running}
				>
					{running ? 'Running...' : 'Say Hello'}
				</button>
				
				<div>{greeting ?? 'Waiting for response'}</div>
			</AgentuityProvider>
		</div>
	);
}
```

### frontend.tsx - Entry Point

```typescript
import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(<App />);
```

### index.html - HTML Template

```html
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>My Agentuity App</title>
</head>
<body>
	<div id="root"></div>
	<script type="module" src="/web/frontend.tsx"></script>
</body>
</html>
```

## React Hooks

### useAgent - Call Agents

```typescript
import { useAgent } from '@agentuity/react';

function MyComponent() {
	const { run, running, data, error } = useAgent('myAgent');
	
	return (
		<button onClick={() => run({ input: 'value' })}>
			{running ? 'Running...' : 'Call Agent'}
		</button>
	);
}
```

### useAgentWebsocket - WebSocket Connection

```typescript
import { useAgentWebsocket } from '@agentuity/react';

function MyComponent() {
	const { connected, send, data } = useAgentWebsocket('websocket');
	
	return (
		<div>
			<p>Status: {connected ? 'Connected' : 'Disconnected'}</p>
			<button onClick={() => send('Hello')}>Send Message</button>
			<p>Received: {data}</p>
		</div>
	);
}
```

### useAgentEventStream - Server-Sent Events

```typescript
import { useAgentEventStream } from '@agentuity/react';

function MyComponent() {
	const { connected, data, error } = useAgentEventStream('sse');
	
	return (
		<div>
			<p>Connected: {connected ? 'Yes' : 'No'}</p>
			{error && <p>Error: {error.message}</p>}
			<p>Data: {data}</p>
		</div>
	);
}
```

## Complete Example

```typescript
import { AgentuityProvider, useAgent, useAgentWebsocket } from '@agentuity/react';
import { useEffect, useState } from 'react';

export function App() {
	const [count, setCount] = useState(0);
	const { run, data: agentResult } = useAgent('simple');
	const { connected, send, data: wsMessage } = useAgentWebsocket('websocket');
	
	useEffect(() => {
		// Send WebSocket message every second
		const interval = setInterval(() => {
			send(`Message at ${new Date().toISOString()}`);
		}, 1000);
		return () => clearInterval(interval);
	}, [send]);

	return (
		<div style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
			<AgentuityProvider>
				<h1>My Agentuity App</h1>
				
				<div>
					<p>Count: {count}</p>
					<button onClick={() => setCount(c => c + 1)}>
						Increment
					</button>
				</div>
				
				<div>
					<button onClick={() => run({ name: 'Jeff', age: 30 })}>
						Call Agent
					</button>
					<p>{agentResult}</p>
				</div>
				
				<div>
					<strong>WebSocket:</strong>
					{connected ? JSON.stringify(wsMessage) : 'Not connected'}
				</div>
			</AgentuityProvider>
		</div>
	);
}
```

## Static Assets

Place static files in the **public/** folder:

```
src/web/public/
├── logo.svg
├── styles.css
└── script.js
```

Reference them in your HTML or components:

```html
<!-- In index.html -->
<link rel="stylesheet" href="/public/styles.css">
<script src="/public/script.js"></script>
```

```typescript
// In React components
<img src="/public/logo.svg" alt="Logo" />
```

## Styling

### Inline Styles

```typescript
<div style={{ backgroundColor: '#000', color: '#fff', padding: '1rem' }}>
	Styled content
</div>
```

### CSS Files

Create `public/styles.css`:

```css
body {
	background-color: #09090b;
	color: #fff;
	font-family: sans-serif;
}
```

Import in `index.html`:

```html
<link rel="stylesheet" href="/public/styles.css">
```

### Style Tag in Component

```typescript
<div>
	<button className="glow-btn">Click me</button>
	<style>{`
		.glow-btn {
			background: linear-gradient(to right, #155e75, #3b82f6);
			border: none;
			padding: 0.75rem 1.5rem;
			color: white;
			cursor: pointer;
		}
	`}</style>
</div>
```

## Best Practices

- Wrap your app with **AgentuityProvider** for hooks to work
- Use **useAgent** for one-off agent calls
- Use **useAgentWebsocket** for bidirectional real-time communication
- Use **useAgentEventStream** for server-to-client streaming
- Place reusable components in separate files
- Keep static assets in the **public/** folder
- Use TypeScript for type safety
- Handle loading and error states in UI

## Rules

- **App.tsx** must export a function named `App`
- **frontend.tsx** must render the `App` component to `#root`
- **index.html** must have a `<div id="root"></div>`
- All agents are accessible via `useAgent('agentName')`
- The web app is served at `/` by default
- Static files in `public/` are served at `/public/*`
- Module script tag: `<script type="module" src="/web/frontend.tsx"></script>`
