import { encodeWorkbenchConfig, type WorkbenchConfig } from '@agentuity/core';

export function generateWorkbenchMainTsx(config: WorkbenchConfig): string {
	const encodedConfig = encodeWorkbenchConfig(config);
	return `// Generated workbench entry point
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@agentuity/workbench';
import '@agentuity/workbench/styles';

// Root element
const rootElement = document.getElementById('root');
if (!rootElement) {
	throw new Error('Root element not found');
}

// Render the app (App has its own provider and config)
const root = createRoot(rootElement);
console.log('encodedConfig', '${encodedConfig}');
root.render(<App configBase64="${encodedConfig}" />);
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
