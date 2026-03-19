/**
 * Config loader for agentuity.config.ts (DEPRECATED in v2)
 *
 * In v2, all runtime config (analytics, workbench) goes in createApp().
 * Vite-specific config (plugins, define, render, bundle) goes in vite.config.ts.
 *
 * This loader still exists for backwards compatibility but will emit a deprecation
 * warning. Runtime config values are now extracted from app.ts via app-config-extractor.
 */

import { join } from 'node:path';
import type { Logger } from '../../../types';
import type { AgentuityConfig } from '../../../types';
import { extractAppConfig, type ExtractedAppConfig } from '../app-config-extractor';

/**
 * Load agentuity.config.ts from the project root (DEPRECATED)
 *
 * Returns null if the file doesn't exist or fails to load.
 * Emits a deprecation warning if the file exists.
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

	// DEPRECATION WARNING
	logger.warn(
		'agentuity.config.ts is deprecated in v2.\n' +
			'  • Runtime config (analytics, workbench) should be in createApp() options.\n' +
			'  • Vite config (plugins, define, render, bundle) should be in vite.config.ts.\n' +
			'  Please delete this file after migrating your config.\n'
	);

	try {
		const config = await import(configPath);
		const userConfig = config.default as AgentuityConfig | undefined;

		if (!userConfig) {
			logger.warn('agentuity.config.ts does not export a default configuration');
			return null;
		}

		logger.trace('Loaded agentuity.config.ts (deprecated)');
		return userConfig;
	} catch (error) {
		logger.warn('Failed to load agentuity.config.ts:', error);
		return null;
	}
}

/**
 * Load runtime config from createApp() in app.ts (v2 approach).
 *
 * This is the preferred way to get analytics/workbench config in v2.
 * The CLI reads these values directly from the user's createApp() call.
 */
export async function loadRuntimeConfig(
	rootDir: string,
	logger: Logger
): Promise<ExtractedAppConfig> {
	return extractAppConfig(rootDir, logger);
}

/**
 * Get workbench configuration with defaults.
 *
 * In v2, workbench config is extracted from createApp() in app.ts.
 * For backwards compatibility, if agentuity.config.ts exists, its workbench
 * value is used as a fallback, but a deprecation warning is emitted.
 */
export function getWorkbenchConfig(
	config: AgentuityConfig | null,
	dev: boolean,
	runtimeConfig?: ExtractedAppConfig
): {
	configured: boolean;
	enabled: boolean;
	route: string;
	headers: Record<string, string>;
} {
	// v2: prefer runtime config from createApp()
	const workbenchFromRuntime = runtimeConfig?.workbench;
	const workbenchFromFile = config?.workbench;

	// Use runtime config (createApp) as primary source
	const hasWorkbench = workbenchFromRuntime !== undefined || workbenchFromFile !== undefined;
	const configured = hasWorkbench;

	// Workbench is enabled if:
	// 1. In dev mode (never in production)
	// 2. Workbench is configured (in createApp or legacy config file)
	const enabled = dev && hasWorkbench;

	// Extract values from the appropriate source
	let route = '/workbench';
	let headers: Record<string, string> = {};

	// Prefer runtime config (from createApp)
	if (workbenchFromRuntime !== undefined) {
		if (typeof workbenchFromRuntime === 'string') {
			route = workbenchFromRuntime;
		} else if (typeof workbenchFromRuntime === 'object' && workbenchFromRuntime !== null) {
			if ('route' in workbenchFromRuntime && typeof workbenchFromRuntime.route === 'string') {
				route = workbenchFromRuntime.route;
			}
			if (
				'headers' in workbenchFromRuntime &&
				typeof workbenchFromRuntime.headers === 'object'
			) {
				headers = workbenchFromRuntime.headers as Record<string, string>;
			}
		}
		// boolean true uses defaults
	} else if (workbenchFromFile !== undefined) {
		// Fallback to legacy config file (deprecated)
		const workbench = workbenchFromFile || {};
		route = workbench.route ?? '/workbench';
		headers = workbench.headers ?? {};
	}

	return {
		configured,
		enabled,
		route,
		headers,
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
	const flat = (userPlugins as unknown[]).flat(Infinity).filter(Boolean);
	return flat.some(
		(p: unknown) =>
			p &&
			typeof p === 'object' &&
			'name' in p &&
			typeof (p as { name: unknown }).name === 'string' &&
			FRAMEWORK_PLUGIN_PREFIXES.some((prefix) => (p as { name: string }).name.startsWith(prefix))
	);
}
