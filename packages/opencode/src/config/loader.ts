import { homedir } from 'node:os';
import { join } from 'node:path';
import { YAML } from 'bun';
import type { CoderConfig, SkillsConfig } from '../types';
import { CoderConfigSchema } from '../types';
import type { TmuxConfig } from '../tmux/types';
import { MIN_PANE_WIDTH } from '../tmux/types';

const CONFIG_DIR = join(homedir(), '.config', 'agentuity');
const DEFAULT_PROFILE = 'production.yaml';

interface CLICoderConfig {
	tmux?: {
		enabled?: boolean;
		maxPanes?: number;
		mainPaneMinWidth?: number;
		agentPaneMinWidth?: number;
	};
}

interface CLIConfig {
	name?: string;
	preferences?: {
		orgId?: string;
	};
	coder?: CLICoderConfig;
}

async function getProfilePath(): Promise<string> {
	// Check AGENTUITY_PROFILE env var first (matches CLI behavior)
	if (process.env.AGENTUITY_PROFILE) {
		const envProfilePath = join(CONFIG_DIR, `${process.env.AGENTUITY_PROFILE}.yaml`);
		const envFile = Bun.file(envProfilePath);
		if (await envFile.exists()) {
			return envProfilePath;
		}
	}

	// Then check profile file
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
 *     "Agentuity Coder Architect": {
 *       "model": "openai/gpt-5.3-codex",
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

		// Extract orgId from CLI config preferences
		// Extract coder settings (tmux) from CLI config coder section
		// Agent model overrides should be done via opencode.json
		const coderConfig: CoderConfig = {
			org: cliConfig.preferences?.orgId,
			tmux: cliConfig.coder?.tmux
				? {
						...DEFAULT_TMUX_CONFIG,
						...cliConfig.coder.tmux,
					}
				: undefined,
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

const DEFAULT_SKILLS_CONFIG: SkillsConfig = {
	enabled: true,
	paths: [],
	disabled: [],
};

const DEFAULT_TMUX_CONFIG: TmuxConfig = {
	enabled: false,
	maxPanes: 4,
	mainPaneMinWidth: 100,
	agentPaneMinWidth: MIN_PANE_WIDTH,
};

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
		skills: DEFAULT_SKILLS_CONFIG,
		tmux: DEFAULT_TMUX_CONFIG,
	};
}

export function mergeConfig(base: CoderConfig, override: CoderConfig): CoderConfig {
	return {
		org: override.org ?? base.org,
		disabledMcps: override.disabledMcps ?? base.disabledMcps,
		blockedCommands: override.blockedCommands ?? base.blockedCommands,
		skills: mergeSkillsConfig(base.skills, override.skills),
		tmux: mergeTmuxConfig(base.tmux, override.tmux),
	};
}

function mergeSkillsConfig(base?: SkillsConfig, override?: SkillsConfig): SkillsConfig | undefined {
	if (!base && !override) return undefined;
	const paths = new Set([...(base?.paths ?? []), ...(override?.paths ?? [])]);
	const disabled = new Set([...(base?.disabled ?? []), ...(override?.disabled ?? [])]);
	return {
		enabled: override?.enabled ?? base?.enabled ?? true,
		paths: paths.size > 0 ? Array.from(paths) : undefined,
		disabled: disabled.size > 0 ? Array.from(disabled) : undefined,
	};
}

function mergeTmuxConfig(base?: TmuxConfig, override?: TmuxConfig): TmuxConfig | undefined {
	if (!base && !override) return undefined;
	return {
		enabled: override?.enabled ?? base?.enabled ?? false,
		maxPanes: override?.maxPanes ?? base?.maxPanes ?? 4,
		mainPaneMinWidth: override?.mainPaneMinWidth ?? base?.mainPaneMinWidth ?? 100,
		agentPaneMinWidth: override?.agentPaneMinWidth ?? base?.agentPaneMinWidth ?? MIN_PANE_WIDTH,
	};
}
