import { join } from 'node:path';
import { encodeWorkbenchConfig, type WorkbenchConfig } from '@agentuity/core';
import { analyzeWorkbench, WorkbenchAnalysis } from './ast';

export function generateWorkbenchMainTsx(config: WorkbenchConfig): string {
	const encodedConfig = encodeWorkbenchConfig(config);
	return `// Generated workbench entry point
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@agentuity/workbench';

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

export function generateWorkbenchStylesCss(): string {
	// This file will be replaced with the actual dist/styles.css content during build
	// We use @import here as a placeholder, but the bundler should resolve it to the built file
	return `/* Generated workbench styles - will be replaced with dist/styles.css */
@import '@agentuity/workbench/styles-standalone';
`;
}

export function generateWorkbenchIndexHtml(): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Agentuity Workbench</title>
	<link rel="stylesheet" href="./styles.css">
</head>
<body>
	<div id="root"></div>
	<script type="module" src="./main.tsx"></script>
</body>
</html>`;
}

export async function getWorkbench(dir: string): Promise<WorkbenchAnalysis> {
	const appFile = Bun.file(join(dir, 'app.ts'));
	if (await appFile.exists()) {
		return analyzeWorkbench(await appFile.text());
	}
	return {
		hasWorkbench: false,
		config: null,
	};
}
