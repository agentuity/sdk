import type { WorkbenchConfig } from '@agentuity/core';

export function generateWorkbenchMainTsx(config: WorkbenchConfig): string {
	const configString = JSON.stringify(config);

	return `// Generated workbench entry point
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AgentuityProvider } from '@agentuity/react';
import { createWorkbench, Workbench } from '@agentuity/workbench';
import '@agentuity/workbench/styles';

// Root element
const rootElement = document.getElementById('root');
if (!rootElement) {
	throw new Error('Root element not found');
}

// Create workbench instance with config from bundler
const workbenchConfig = ${configString};
const workbench = createWorkbench(workbenchConfig);

function App() {
	return (
		<AgentuityProvider baseUrl={window.location.origin}>
			<div className="min-h-screen bg-background text-foreground">
				<Workbench workbench={workbench} />
			</div>
		</AgentuityProvider>
	);
}

// Render the app
const root = createRoot(rootElement);
root.render(<App />);
`;
}

export function generateWorkbenchIndexHtml(): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Agentuity Workbench</title>
</head>
<body>
	<div id="root"></div>
	<script type="module" src="./main.tsx"></script>
</body>
</html>`;
}
