/**
 * Runtime environment bootstrapping utility
 *
 * Loads configuration and environment variables based on the active profile
 * before createApp() is called. This ensures .env.{profile} files and
 * agentuity.{profile}.json configs are respected.
 */

import { loadConfig, loadProjectConfig } from './config';
import { getEnvFilePaths, readEnvFile, type EnvVars } from './env-util';
import type { Config, ProjectConfig } from './types';

export interface RuntimeBootstrapOptions {
	/**
	 * Project directory containing agentuity.json and .env files
	 * @default process.cwd()
	 */
	projectDir?: string;

	/**
	 * Override the active profile (otherwise uses loadConfig())
	 */
	profile?: string;
}

export interface RuntimeBootstrapResult {
	/**
	 * Resolved CLI config (from ~/.config/agentuity/)
	 */
	config: Config | null;

	/**
	 * Resolved project config (agentuity.json or agentuity.{profile}.json)
	 */
	projectConfig: ProjectConfig | null;
}

/**
 * Bootstrap runtime environment by loading profile-aware config and env files.
 *
 * This function:
 * 1. Resolves the active profile (from AGENTUITY_PROFILE env or profile config)
 * 2. Loads .env.{profile}, .env.development, or .env based on profile
 * 3. Sets AGENTUITY_REGION=local for local profile
 * 4. Loads agentuity.{profile}.json if it exists
 * 5. Does NOT override environment variables already set
 *
 * Call this BEFORE createApp() in your app.ts:
 *
 * @example
 * ```ts
 * import { bootstrapRuntimeEnv } from '@agentuity/cli/runtime-bootstrap';
 * import { createApp } from '@agentuity/runtime';
 *
 * // Load config and env based on active profile
 * await bootstrapRuntimeEnv();
 *
 * // Now createApp() will use the correct env vars
 * const app = await createApp();
 * ```
 */
export async function bootstrapRuntimeEnv(
	options: RuntimeBootstrapOptions = {}
): Promise<RuntimeBootstrapResult> {
	const projectDir = options.projectDir || process.cwd();

	// Load CLI config to determine active profile
	let cfg: Config | null = null;
	try {
		cfg = await loadConfig();
		// Override profile if specified
		if (options.profile) {
			cfg = { ...cfg, name: options.profile };
		}
	} catch {
		// No config found - OK for tests without CLI setup
	}

	// Determine which .env files to load based on profile
	const isProduction = process.env.NODE_ENV === 'production';
	const envPaths = getEnvFilePaths(projectDir, {
		configName: cfg?.name,
		isProduction,
	});

	// Load and merge env files (later files override earlier ones)
	let fileEnv: EnvVars = {};
	for (const path of envPaths) {
		const vars = await readEnvFile(path);
		// Later files override earlier ones
		fileEnv = { ...fileEnv, ...vars };
	}

	// Apply to process.env ONLY if not already set
	// This ensures existing env vars (from shell/CI) always win
	for (const [key, value] of Object.entries(fileEnv)) {
		if (process.env[key] === undefined) {
			process.env[key] = value;
		}
	}

	// For local profile, default AGENTUITY_REGION to 'local'
	// This makes getServiceUrls() use *.agentuity.io instead of *.agentuity.cloud
	if (cfg?.name === 'local' && !process.env.AGENTUITY_REGION) {
		process.env.AGENTUITY_REGION = 'local';
	}

	// Propagate profile name into env for consistency
	if (cfg?.name && !process.env.AGENTUITY_PROFILE) {
		process.env.AGENTUITY_PROFILE = cfg.name;
	}

	// Load project config (agentuity.json or agentuity.{profile}.json)
	let projectConfig: ProjectConfig | null = null;
	try {
		projectConfig = await loadProjectConfig(projectDir, cfg ?? undefined);
	} catch {
		// OK for tests that don't need project config
	}

	return {
		config: cfg,
		projectConfig,
	};
}
