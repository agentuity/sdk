import { homedir } from 'node:os';
import { join } from 'node:path';
import { YAML } from 'bun';
import type { CoderConfig } from '../types';
import { CoderConfigSchema } from '../types';

const CONFIG_DIR = join(homedir(), '.config', 'agentuity');
const DEFAULT_PROFILE = 'production.yaml';

interface CLIConfig {
	name?: string;
	preferences?: {
		orgId?: string;
	};
}

async function getProfilePath(): Promise<string> {
	const profileFile = Bun.file(join(CONFIG_DIR, 'profile'));

	if (await profileFile.exists()) {
		const savedPath = (await profileFile.text()).trim();
		const savedFile = Bun.file(savedPath);
		if (await savedFile.exists()) {
			return savedPath;
		}
	}

	return join(CONFIG_DIR, DEFAULT_PROFILE);
}

/**
 * Returns the default config path without resolving the active profile.
 * Use loadCoderConfig() for actual config loading which resolves via getProfilePath().
 */
export function getDefaultConfigPath(): string {
	return join(CONFIG_DIR, DEFAULT_PROFILE);
}

/**
 * Returns the actual config path that will be used, resolving the active profile.
 */
export async function getConfigPath(): Promise<string> {
	return getProfilePath();
}

/**
 * Load plugin configuration.
 *
 * This primarily loads the orgId from the Agentuity CLI profile.
 * Agent model configuration should be done via OpenCode's native opencode.json.
 *
 * Users can override agent models in their opencode.json:
 * ```json
 * {
 *   "agent": {
 *     "Agentuity Coder Sr Builder": {
 *       "model": "openai/gpt-5.2-codex",
 *       "reasoningEffort": "xhigh"
 *     }
 *   }
 * }
 * ```
 */
export async function loadCoderConfig(): Promise<CoderConfig> {
	try {
		const configPath = await getProfilePath();
		const configFile = Bun.file(configPath);

		if (!(await configFile.exists())) {
			return getDefaultConfig();
		}

		const content = await configFile.text();
		const cliConfig = YAML.parse(content) as CLIConfig;

		// Only extract orgId from CLI config
		// Agent model overrides should be done via opencode.json
		const coderConfig: CoderConfig = {
			org: cliConfig.preferences?.orgId,
		};

		const result = CoderConfigSchema.safeParse(coderConfig);

		if (!result.success) {
			console.warn(`Warning: Invalid coder config in ${configPath}:`, result.error.message);
			return getDefaultConfig();
		}

		return mergeConfig(getDefaultConfig(), result.data);
	} catch (error) {
		console.warn(`Warning: Could not read Agentuity config:`, error);
		return getDefaultConfig();
	}
}

/** Default CLI command patterns to block for security */
const DEFAULT_BLOCKED_COMMANDS = [
	'cloud secrets', // Never expose secrets
	'cloud secret', // Alias
	'cloud apikey', // Don't leak API keys
	'auth token', // Don't leak auth tokens
];

/**
 * Get default configuration.
 *
 * Note: Agent model defaults are defined in agent definition files (src/agents/).
 * Users can override agent models via opencode.json.
 */
export function getDefaultConfig(): CoderConfig {
	return {
		disabledMcps: [],
		blockedCommands: DEFAULT_BLOCKED_COMMANDS,
	};
}

export function mergeConfig(base: CoderConfig, override: CoderConfig): CoderConfig {
	return {
		org: override.org ?? base.org,
		disabledMcps: override.disabledMcps ?? base.disabledMcps,
		blockedCommands: override.blockedCommands ?? base.blockedCommands,
	};
}
