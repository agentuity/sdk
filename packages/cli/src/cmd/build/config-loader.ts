import { join } from 'node:path';
import { StructuredError } from '@agentuity/core';
import type { BuildConfigFunction, BuildPhase, BuildContext, BuildConfig } from '../../types';

const BuildConfigLoadError = StructuredError('BuildConfigLoadError');
const BuildConfigValidationError = StructuredError('BuildConfigValidationError');

/**
 * Reserved define keys that cannot be overridden by user config
 */
const RESERVED_DEFINE_PREFIXES = [
	'process.env.AGENTUITY_',
	'process.env.NODE_ENV',
	'process.env.AGENTUITY_CLOUD_SDK_VERSION',
	'process.env.AGENTUITY_CLOUD_ORG_ID',
	'process.env.AGENTUITY_CLOUD_PROJECT_ID',
	'process.env.AGENTUITY_CLOUD_DEPLOYMENT_ID',
	'process.env.AGENTUITY_PUBLIC_WORKBENCH_PATH',
];

/**
 * Load and validate agentuity.config.ts from the project root
 */
export async function loadBuildConfig(rootDir: string): Promise<BuildConfigFunction | null> {
	const configPath = join(rootDir, 'agentuity.config.ts');

	// Check if config file exists
	const configFile = Bun.file(configPath);
	if (!(await configFile.exists())) {
		return null; // No config file is OK - it's optional
	}

	try {
		// Import the config file (Bun handles TypeScript natively)
		// Use file:// URL to ensure absolute path resolution
		const configModule = await import(`file://${configPath}`);

		// Get the default export
		const configFunction = configModule.default;

		// Validate it's a function
		if (typeof configFunction !== 'function') {
			throw new BuildConfigValidationError({
				message: `agentuity.config.ts must export a default function, got ${typeof configFunction}`,
			});
		}

		return configFunction as BuildConfigFunction;
	} catch (error) {
		// If it's already our error, re-throw
		if (error instanceof BuildConfigValidationError || error instanceof BuildConfigLoadError) {
			throw error;
		}

		// Wrap other errors
		throw new BuildConfigLoadError({
			message: `Failed to load agentuity.config.ts: ${error instanceof Error ? error.message : String(error)}`,
			cause: error instanceof Error ? error : undefined,
		});
	}
}

/**
 * Execute the build config function for a specific phase and validate the result
 */
export async function executeBuildConfig(
	configFunction: BuildConfigFunction,
	phase: BuildPhase,
	context: BuildContext
): Promise<BuildConfig> {
	try {
		// Execute the config function (may be async)
		const config = await configFunction(phase, context);

		// Validate the result is an object
		if (!config || typeof config !== 'object') {
			throw new BuildConfigValidationError({
				message: `Build config for phase "${phase}" must return an object, got ${typeof config}`,
			});
		}

		// Validate plugins array if provided
		if (config.plugins !== undefined) {
			if (!Array.isArray(config.plugins)) {
				throw new BuildConfigValidationError({
					message: `Build config plugins for phase "${phase}" must be an array, got ${typeof config.plugins}`,
				});
			}
			// Validate each plugin has a name property (basic BunPlugin check)
			for (const plugin of config.plugins) {
				if (!plugin || typeof plugin !== 'object' || !('name' in plugin)) {
					throw new BuildConfigValidationError({
						message: `Invalid plugin in phase "${phase}": plugins must be BunPlugin objects with a name property`,
					});
				}
			}
		}

		// Validate external array if provided
		if (config.external !== undefined) {
			if (!Array.isArray(config.external)) {
				throw new BuildConfigValidationError({
					message: `Build config external for phase "${phase}" must be an array, got ${typeof config.external}`,
				});
			}
			// Validate each external is a string
			for (const ext of config.external) {
				if (typeof ext !== 'string') {
					throw new BuildConfigValidationError({
						message: `Invalid external in phase "${phase}": all externals must be strings, got ${typeof ext}`,
					});
				}
			}
		}

		// Validate and filter define object if provided
		if (config.define !== undefined) {
			if (typeof config.define !== 'object' || config.define === null) {
				throw new BuildConfigValidationError({
					message: `Build config define for phase "${phase}" must be an object, got ${typeof config.define}`,
				});
			}

			// Check for reserved keys and filter them out
			const filteredDefine: Record<string, string> = {};
			const blockedKeys: string[] = [];

			for (const [key, value] of Object.entries(config.define)) {
				// Check if this key starts with any reserved prefix
				const isReserved = RESERVED_DEFINE_PREFIXES.some((prefix) => key.startsWith(prefix));

				if (isReserved) {
					blockedKeys.push(key);
					continue; // Skip reserved keys
				}

				// Validate value is a string
				if (typeof value !== 'string') {
					throw new BuildConfigValidationError({
						message: `Build config define values for phase "${phase}" must be strings, got ${typeof value} for key "${key}"`,
					});
				}

				filteredDefine[key] = value;
			}

			// Warn if we blocked any keys
			if (blockedKeys.length > 0) {
				context.logger.warn(
					`Build config for phase "${phase}" attempted to override reserved define keys (ignored): ${blockedKeys.join(', ')}`
				);
			}

			// Replace with filtered version
			config.define = filteredDefine;
		}

		return config;
	} catch (error) {
		// If it's already our error, re-throw
		if (error instanceof BuildConfigValidationError) {
			throw error;
		}

		// Wrap other errors
		throw new BuildConfigLoadError({
			message: `Failed to execute build config for phase "${phase}": ${error instanceof Error ? error.message : String(error)}`,
			cause: error instanceof Error ? error : undefined,
		});
	}
}

/**
 * Merge user build config with base Bun.BuildConfig
 * User config is applied AFTER base config with safeguards
 */
export function mergeBuildConfig(
	baseConfig: Partial<import('bun').BuildConfig>,
	userConfig: BuildConfig
): Partial<import('bun').BuildConfig> {
	const merged = { ...baseConfig };

	// Merge plugins (user plugins come AFTER Agentuity plugin)
	if (userConfig.plugins && userConfig.plugins.length > 0) {
		merged.plugins = [...(baseConfig.plugins ?? []), ...userConfig.plugins];
	}

	// Merge external (combine arrays, dedupe)
	if (userConfig.external && userConfig.external.length > 0) {
		const existingExternal = Array.isArray(baseConfig.external)
			? baseConfig.external
			: baseConfig.external
				? [baseConfig.external]
				: [];
		merged.external = [...new Set([...existingExternal, ...userConfig.external])];
	}

	// Merge define (user defines come last, but reserved keys already filtered)
	if (userConfig.define && Object.keys(userConfig.define).length > 0) {
		merged.define = {
			...baseConfig.define,
			...userConfig.define,
		};
	}

	return merged;
}
