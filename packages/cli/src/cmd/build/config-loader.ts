import { join } from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { StructuredError } from '@agentuity/core';
import type { BuildConfigFunction, BuildPhase, BuildContext, BuildConfig } from '../../types';

const BuildConfigLoadError = StructuredError('BuildConfigLoadError');
const BuildConfigValidationError = StructuredError('BuildConfigValidationError');

/**
 * Reserved define keys that cannot be overridden by user config
 */
const RESERVED_DEFINE_PREFIXES = ['process.env.AGENTUITY_', 'process.env.NODE_ENV'];

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
		// Create a temporary directory for the wrapper script
		const tempDir = mkdtempSync(join(tmpdir(), 'agentuity-config-'));
		const wrapperPath = join(tempDir, 'wrapper.ts');

		try {
			// Create a wrapper script that imports the config and outputs it as JSON
			// This approach is simpler and more reliable than bundling + vm context
			const wrapperCode = `
import configFunction from ${JSON.stringify(configPath)};

// Validate it's a function
if (typeof configFunction !== 'function') {
	console.error(JSON.stringify({
		error: 'BuildConfigValidationError',
		message: \`agentuity.config.ts must export a default function, got \${typeof configFunction}\`
	}));
	process.exit(1);
}

// Output success marker
console.log('__CONFIG_LOADED__');
`;

			writeFileSync(wrapperPath, wrapperCode);

			// Run the wrapper script with Bun
			// Note: stdout/stderr are piped (not inherited) to suppress output from user's screen
			const proc = Bun.spawn(['bun', wrapperPath], {
				cwd: rootDir,
				stdout: 'pipe', // Capture stdout to prevent output to user's terminal
				stderr: 'pipe', // Capture stderr to prevent output to user's terminal
			});

			const output = await new Response(proc.stdout).text();
			const errorOutput = await new Response(proc.stderr).text();
			const exitCode = await proc.exited;

			if (exitCode !== 0) {
				// Try to parse error as JSON
				try {
					const errorData = JSON.parse(errorOutput);
					if (errorData.error === 'BuildConfigValidationError') {
						throw new BuildConfigValidationError({
							message: errorData.message,
						});
					}
				} catch (_parseError) {
					// Not JSON, treat as regular error
				}

				throw new BuildConfigLoadError({
					message: `Failed to load agentuity.config.ts:\n${errorOutput}`,
				});
			}

			// Verify the success marker
			if (!output.includes('__CONFIG_LOADED__')) {
				throw new BuildConfigLoadError({
					message: 'Config file loaded but did not output expected marker',
				});
			}

			// Now import the config file directly - it's been validated
			const configModule = await import(configPath);
			const configFunction = configModule.default;

			// Double-check it's a function (should always pass if wrapper succeeded)
			if (typeof configFunction !== 'function') {
				throw new BuildConfigValidationError({
					message: `agentuity.config.ts must export a default function, got ${typeof configFunction}`,
				});
			}

			return configFunction as BuildConfigFunction;
		} finally {
			// Clean up temp directory
			rmSync(tempDir, { recursive: true, force: true });
		}
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
 * Returns a complete Bun.BuildConfig with user overrides applied
 */
export function mergeBuildConfig(
	baseConfig: import('bun').BuildConfig,
	userConfig: BuildConfig
): import('bun').BuildConfig {
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
