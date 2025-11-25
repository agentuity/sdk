/**
 * Workbench configuration utilities shared across packages
 */

export interface WorkbenchConfig {
	route?: string;
	headers?: Record<string, string>;
	port?: number;
}

/**
 * Encode workbench config to base64 for environment variable storage
 */
export function encodeWorkbenchConfig(config: WorkbenchConfig): string {
	const json = JSON.stringify(config);

	// Use Node.js Buffer if available (build-time), otherwise browser btoa (shouldn't be called in browser)
	if (typeof Buffer !== 'undefined') {
		return Buffer.from(json).toString('base64');
	} else {
		return btoa(json);
	}
}

/**
 * Decode workbench config from base64 environment variable
 * Throws error if config is invalid
 */
export function decodeWorkbenchConfig(encoded: string): WorkbenchConfig {
	try {
		let json: string;

		// Use appropriate decoding method based on environment
		if (typeof Buffer !== 'undefined') {
			// Node.js environment (build-time)
			json = Buffer.from(encoded, 'base64').toString('utf-8');
		} else if (typeof atob !== 'undefined') {
			// Browser environment (runtime)
			json = atob(encoded);
		} else {
			throw new Error('No base64 decoding method available');
		}

		const config = JSON.parse(json) as WorkbenchConfig;
		return config;
	} catch (error) {
		throw new Error(
			`Failed to decode workbench config: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error }
		);
	}
}

/**
 * Get workbench config from build-time variable
 * Throws error if config is not available or invalid
 */
export function getWorkbenchConfig(): WorkbenchConfig {
	// This will be replaced at build time by Bun's define mechanism
	// @ts-expect-error - AGENTUITY_WORKBENCH_CONFIG_INLINE will be replaced at build time
	if (typeof AGENTUITY_WORKBENCH_CONFIG_INLINE === 'undefined') {
		throw new Error('Workbench config not found - build process did not inline config');
	}

	// @ts-expect-error - AGENTUITY_WORKBENCH_CONFIG_INLINE will be replaced at build time
	return decodeWorkbenchConfig(AGENTUITY_WORKBENCH_CONFIG_INLINE);
}
