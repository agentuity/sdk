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
 * NOTE: Workbench is only available in dev mode
 *
 * Presence of workbench config implicitly enables it (no explicit 'enabled' flag needed)
 * Missing workbench config implicitly disables it
 */
export function getWorkbenchConfig(
	config: AgentuityConfig | null,
	dev: boolean
): {
	enabled: boolean;
	route: string;
	headers: Record<string, string>;
} {
	const hasWorkbenchConfig = config?.workbench !== undefined;

	// Workbench is enabled if:
	// 1. In dev mode (never in production)
	// 2. Config has a workbench object (presence implies enablement)
	const enabled = dev && hasWorkbenchConfig;

	const workbench = config?.workbench || {};

	return {
		enabled,
		route: workbench.route ?? '/workbench',
		headers: workbench.headers ?? {},
	};
}
