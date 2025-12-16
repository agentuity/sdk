/**
 * Workbench file generator for Vite builds
 */

import { join } from 'node:path';
import { mkdirSync, existsSync, cpSync } from 'node:fs';
import {
	encodeWorkbenchConfig,
	type WorkbenchConfig as CoreWorkbenchConfig,
} from '@agentuity/core';
import type { Logger, WorkbenchConfig } from '../../../types';

/**
 * Find the @agentuity/workbench package path
 */
async function findWorkbenchPackage(rootDir: string, logger: Logger): Promise<string | null> {
	// Try app-level node_modules first
	const appLevel = join(rootDir, 'node_modules', '@agentuity', 'workbench');
	if (existsSync(appLevel)) {
		return appLevel;
	}

	// Try workspace root (walk up looking for workspace)
	let current = rootDir;
	while (true) {
		const pkgPath = join(current, 'package.json');
		if (existsSync(pkgPath)) {
			try {
				const pkg = JSON.parse(await Bun.file(pkgPath).text());
				if (pkg.workspaces) {
					// Found workspace root
					const workspaceWorkbench = join(current, 'node_modules', '@agentuity', 'workbench');
					if (existsSync(workspaceWorkbench)) {
						return workspaceWorkbench;
					}
					// Try workspace packages directory
					const packagesWorkbench = join(current, 'packages', 'workbench');
					if (existsSync(packagesWorkbench)) {
						return packagesWorkbench;
					}
				}
			} catch {
				// Ignore parse errors
			}
		}
		const parent = join(current, '..');
		if (parent === current) break;
		current = parent;
	}

	logger.warn('Could not find @agentuity/workbench package');
	return null;
}

/**
 * Generate workbench main.tsx file
 */
function generateMainTsx(config: CoreWorkbenchConfig): string {
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

// Render the app
const root = createRoot(rootElement);
root.render(<App configBase64="${encodedConfig}" />);
`;
}

/**
 * Generate workbench index.html file
 */
function generateIndexHtml(): string {
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

/**
 * Generate workbench files in .agentuity/workbench-src/
 * This keeps them separate from user's source code
 */
export async function generateWorkbenchFiles(
	rootDir: string,
	projectId: string,
	config: WorkbenchConfig,
	logger: Logger
): Promise<void> {
	const workbenchDir = join(rootDir, '.agentuity', 'workbench-src');

	// Create directory if it doesn't exist
	if (!existsSync(workbenchDir)) {
		mkdirSync(workbenchDir, { recursive: true });
		logger.debug('Created workbench directory: %s', workbenchDir);
	}

	// Create core workbench config
	const coreConfig: CoreWorkbenchConfig = {
		route: config.route ?? '/workbench',
		headers: config.headers ?? {},
	};

	// Generate main.tsx
	const mainTsxPath = join(workbenchDir, 'main.tsx');
	await Bun.write(mainTsxPath, generateMainTsx(coreConfig));
	logger.debug('Generated workbench main.tsx');

	// Generate index.html
	const indexHtmlPath = join(workbenchDir, 'index.html');
	await Bun.write(indexHtmlPath, generateIndexHtml());
	logger.debug('Generated workbench index.html');

	// Copy standalone CSS from @agentuity/workbench package
	const workbenchPackage = await findWorkbenchPackage(rootDir, logger);
	if (workbenchPackage) {
		const distCss = join(workbenchPackage, 'dist', 'standalone.css');
		const srcCss = join(workbenchPackage, 'src', 'standalone.css');
		const destCss = join(workbenchDir, 'styles.css');

		if (existsSync(distCss)) {
			cpSync(distCss, destCss);
			logger.debug('Copied workbench standalone.css from dist');
		} else if (existsSync(srcCss)) {
			cpSync(srcCss, destCss);
			logger.warn('Using source standalone.css (ensure @agentuity/workbench is built)');
		} else {
			logger.error('Workbench styles not found in package: %s', workbenchPackage);
			throw new Error('Workbench styles not found. Ensure @agentuity/workbench is installed.');
		}
	} else {
		throw new Error('Could not find @agentuity/workbench package. Ensure it is installed.');
	}

	logger.trace('Workbench files generated successfully');
}
