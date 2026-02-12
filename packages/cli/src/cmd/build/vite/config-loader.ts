/**
 * Config loader for agentuity.config.ts
 */

import { join } from 'node:path';
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
 * Known Vite framework plugin name prefixes.
 * Each framework's Vite plugin registers one or more plugins whose names
 * start with these prefixes. We match against these to detect whether the
 * user has already configured a framework plugin in their agentuity.config.ts.
 */
const FRAMEWORK_PLUGIN_PREFIXES = [
	'vite:react', // @vitejs/plugin-react  (vite:react-babel, vite:react-refresh, …)
	'vite:preact', // @preact/preset-vite
	'vite-plugin-svelte', // @sveltejs/vite-plugin-svelte
	'vite:vue', // @vitejs/plugin-vue      (vite:vue, vite:vue-jsx)
	'vite-plugin-solid', // vite-plugin-solid
	'solid', // vite-plugin-solid also uses plain "solid"
];

/**
 * Check if the user's plugins include any known UI-framework Vite plugin
 * (React, Svelte, Vue, Solid, Preact, …).
 *
 * Detection is name-based: Vite plugins expose a `name` property and every
 * major framework plugin uses a predictable prefix. This avoids dynamically
 * importing every possible framework just to compare names.
 */
export function hasFrameworkPlugin(userPlugins: import('vite').PluginOption[]): boolean {
	const flat = (userPlugins as any[]).flat(Infinity).filter(Boolean);
	return flat.some(
		(p: any) =>
			p &&
			typeof p === 'object' &&
			'name' in p &&
			typeof p.name === 'string' &&
			FRAMEWORK_PLUGIN_PREFIXES.some((prefix) => p.name.startsWith(prefix))
	);
}
