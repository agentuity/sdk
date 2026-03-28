/**
 * Config loader for v2
 *
 * In v2, all runtime config (analytics, workbench) goes in createApp().
 * Vite-specific config (plugins, define, render, bundle) goes in vite.config.ts.
 *
 * Runtime config values are extracted from app.ts via app-config-extractor.
 */

import type { Logger } from '../../../types';
import { extractAppConfig, type ExtractedAppConfig } from '../app-config-extractor';

/**
 * Load runtime config from createApp() in app.ts (v2 approach).
 *
 * This is the only way to get analytics/workbench config in v2.
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
 */
export function getWorkbenchConfig(
	dev: boolean,
	runtimeConfig?: ExtractedAppConfig
): {
	configured: boolean;
	enabled: boolean;
	route: string;
	headers: Record<string, string>;
} {
	const workbenchFromRuntime = runtimeConfig?.workbench;

	// Workbench is enabled if:
	// 1. In dev mode (never in production)
	// 2. Workbench is configured in createApp()
	const hasWorkbench = workbenchFromRuntime !== undefined;
	const configured = hasWorkbench;
	const enabled = dev && hasWorkbench;

	// Extract values from createApp()
	let route = '/workbench';
	let headers: Record<string, string> = {};

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
	}

	return {
		configured,
		enabled,
		route,
		headers,
	};
}
