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
	coder?: {
		source?: 'npm' | 'local';
		path?: string;
		org?: string;
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

export function getConfigPath(): string {
	return join(CONFIG_DIR, DEFAULT_PROFILE);
}

export async function loadCoderConfig(): Promise<CoderConfig> {
	try {
		const configPath = await getProfilePath();
		const configFile = Bun.file(configPath);

		if (!(await configFile.exists())) {
			return getDefaultConfig();
		}

		const content = await configFile.text();
		const cliConfig = YAML.parse(content) as CLIConfig;

		const coderConfig: CoderConfig = {
			org: cliConfig.coder?.org ?? cliConfig.preferences?.orgId,
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

export function getDefaultConfig(): CoderConfig {
	return {
		agents: {
			lead: { model: 'anthropic/claude-opus-4-5-20251101' },
			scout: { model: 'anthropic/claude-haiku-4-5-20251001' },
			builder: { model: 'anthropic/claude-opus-4-5-20251101' },
			reviewer: { model: 'anthropic/claude-haiku-4-5-20251001' },
			memory: { model: 'anthropic/claude-haiku-4-5-20251001' },
			expert: { model: 'anthropic/claude-opus-4-5-20251101' },
		},
		disabledMcps: [],
		blockedCommands: DEFAULT_BLOCKED_COMMANDS,
	};
}

export function mergeConfig(base: CoderConfig, override: CoderConfig): CoderConfig {
	return {
		org: override.org ?? base.org,
		agents: {
			...base.agents,
			...override.agents,
		},
		disabledMcps: override.disabledMcps ?? base.disabledMcps,
		blockedCommands: override.blockedCommands ?? base.blockedCommands,
	};
}
