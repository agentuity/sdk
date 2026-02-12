/**
 * Config loader for agentuity.config.ts
 */

import { join } from 'node:path';
import { createRequire } from 'node:module';
import type { Logger } from '../../../types';
import type { AgentuityConfig } from '../../../types';

/**
 * Load agentuity.config.ts from the project root
 * Returns null if the file doesn't exist or fails to load
 */
export async function loadAgentuityConfig(
	rootDir: string,
	logger: Logger
): Promise<AgentuityConfig | null> {
	const configPath = join(rootDir, 'agentuity.config.ts');

	if (!(await Bun.file(configPath).exists())) {
		logger.trace('No agentuity.config.ts found');
		return null;
	}

	try {
		const config = await import(configPath);
		const userConfig = config.default as AgentuityConfig | undefined;

		if (!userConfig) {
			logger.warn('agentuity.config.ts does not export a default configuration');
			return null;
		}

		logger.trace('Loaded agentuity.config.ts');
		return userConfig;
	} catch (error) {
		logger.warn('Failed to load agentuity.config.ts:', error);
		return null;
	}
}

/**
 * Get workbench configuration with defaults
 * NOTE: Workbench is only enabled at runtime in dev mode, but we need to know
 * if it's configured at build time so we can generate the correct code.
 *
 * Presence of workbench config implicitly enables it (no explicit 'enabled' flag needed)
 * Missing workbench config implicitly disables it
 */
export function getWorkbenchConfig(
	config: AgentuityConfig | null,
	dev: boolean
): {
	configured: boolean;
	enabled: boolean;
	route: string;
	headers: Record<string, string>;
} {
	const configured = config?.workbench !== undefined;

	// Workbench is enabled if:
	// 1. In dev mode (never in production)
	// 2. Config has a workbench object (presence implies enablement)
	const enabled = dev && configured;

	const workbench = config?.workbench || {};

	return {
		configured,
		enabled,
		route: workbench.route ?? '/workbench',
		headers: workbench.headers ?? {},
	};
}

/**
 * Check if the user's plugins include the React Vite plugin.
 * Resolves and instantiates the React plugin to match by name,
 * ensuring forward-compatible detection even if plugin names change.
 */
export async function hasReactPlugin(
	rootDir: string,
	userPlugins: import('vite').PluginOption[]
): Promise<boolean> {
	// Resolve and instantiate the react plugin to discover its plugin names
	const projectRequire = createRequire(join(rootDir, 'package.json'));
	let reactPluginPath = '@vitejs/plugin-react';
	try {
		reactPluginPath = projectRequire.resolve('@vitejs/plugin-react');
	} catch {
		// Fall back to CLI's bundled version
	}
	const reactModule = await import(reactPluginPath);
	const reactPlugins = [reactModule.default()].flat();
	const reactNames = new Set(
		reactPlugins
			.filter((p: any): p is { name: string } => p && typeof p === 'object' && 'name' in p)
			.map((p: { name: string }) => p.name)
	);

	// Flatten user plugins and check for any name match
	const flat = (userPlugins as any[]).flat(Infinity).filter(Boolean);
	return flat.some(
		(p: any) => p && typeof p === 'object' && 'name' in p && reactNames.has(p.name)
	);
}
