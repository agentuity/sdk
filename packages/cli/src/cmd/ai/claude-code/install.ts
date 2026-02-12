import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createSubcommand, type CommandContext } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';

const CLAUDE_DIR = join(homedir(), '.claude');
const CLAUDE_SETTINGS_FILE = join(CLAUDE_DIR, 'settings.local.json');
const PLUGIN_INSTALL_DIR = join(homedir(), '.agentuity', 'plugins', 'claude-code');

interface ClaudeSettings {
	permissions?: {
		allow?: string[];
		deny?: string[];
	};
	pluginDirs?: string[];
	[key: string]: unknown;
}

const AGENTUITY_ALLOW_PERMISSIONS = ['Bash(agentuity cloud *)', 'Bash(agentuity auth whoami *)'];

const AGENTUITY_DENY_PERMISSIONS = [
	'Bash(agentuity cloud secrets *)',
	'Bash(agentuity cloud secret *)',
	'Bash(agentuity cloud apikey *)',
	'Bash(agentuity auth token *)',
];

function readClaudeSettings(): ClaudeSettings {
	try {
		if (existsSync(CLAUDE_SETTINGS_FILE)) {
			const content = readFileSync(CLAUDE_SETTINGS_FILE, 'utf-8');
			return JSON.parse(content);
		}
	} catch {
		// invalid or missing
	}
	return {};
}

function writeClaudeSettings(settings: ClaudeSettings): void {
	if (!existsSync(CLAUDE_DIR)) {
		mkdirSync(CLAUDE_DIR, { recursive: true });
	}
	writeFileSync(CLAUDE_SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n');
}

function configurePermissions(settings: ClaudeSettings): number {
	if (!settings.permissions) {
		settings.permissions = {};
	}
	if (!settings.permissions.allow) {
		settings.permissions.allow = [];
	}
	if (!settings.permissions.deny) {
		settings.permissions.deny = [];
	}

	let added = 0;

	for (const perm of AGENTUITY_ALLOW_PERMISSIONS) {
		if (!settings.permissions.allow.includes(perm)) {
			settings.permissions.allow.push(perm);
			added++;
		}
	}

	for (const perm of AGENTUITY_DENY_PERMISSIONS) {
		if (!settings.permissions.deny.includes(perm)) {
			settings.permissions.deny.push(perm);
			added++;
		}
	}

	return added;
}

async function installPackage(logger: { debug: (msg: string) => void }): Promise<string | null> {
	if (!existsSync(PLUGIN_INSTALL_DIR)) {
		mkdirSync(PLUGIN_INSTALL_DIR, { recursive: true });
	}

	const packageJsonPath = join(PLUGIN_INSTALL_DIR, 'package.json');
	if (!existsSync(packageJsonPath)) {
		writeFileSync(
			packageJsonPath,
			JSON.stringify({ name: 'agentuity-claude-code-plugin', private: true }, null, 2)
		);
	}

	logger.debug(`Installing @agentuity/claude-code to ${PLUGIN_INSTALL_DIR}`);

	const proc = Bun.spawn(['bun', 'add', '@agentuity/claude-code@latest'], {
		cwd: PLUGIN_INSTALL_DIR,
		stdio: ['ignore', 'pipe', 'pipe'],
	});

	await proc.exited;

	const pluginPath = join(PLUGIN_INSTALL_DIR, 'node_modules', '@agentuity', 'claude-code');
	if (existsSync(join(pluginPath, '.claude-plugin', 'plugin.json'))) {
		return pluginPath;
	}

	return null;
}

export const installSubcommand = createSubcommand({
	name: 'install',
	description: 'Install Agentuity Coder plugin for Claude Code',
	tags: ['fast'],
	requires: { auth: true, apiClient: true, org: true },
	examples: [
		{
			command: getCommand('ai claude-code install'),
			description: 'Install Agentuity Coder plugin for Claude Code',
		},
	],
	async handler(ctx: CommandContext<{ auth: true; apiClient: true; org: true }>) {
		const { options, orgId, logger } = ctx;
		const jsonMode = !!options?.json;

		if (!jsonMode) {
			tui.newline();
			tui.output(tui.bold('Installing Agentuity Coder plugin for Claude Code'));
			tui.newline();
			tui.success(`Using organization: ${orgId}`);
		}

		if (!jsonMode) {
			tui.info('Installing @agentuity/claude-code package...');
		}

		const pluginPath = await installPackage(logger);

		if (!pluginPath) {
			if (!jsonMode) {
				tui.error('Failed to install @agentuity/claude-code package');
				tui.info('Make sure bun is installed and try again');
			}
			return { success: false, orgId };
		}

		if (!jsonMode) {
			tui.success(`Plugin installed to: ${pluginPath}`);
		}

		const settings = readClaudeSettings();

		const permissionsAdded = configurePermissions(settings);
		if (permissionsAdded > 0) {
			if (!jsonMode) {
				tui.success(
					`Configured ${permissionsAdded} permission rules for Agentuity Cloud commands`
				);
			}
		} else {
			if (!jsonMode) {
				tui.info('Permissions already configured');
			}
		}

		writeClaudeSettings(settings);

		if (!jsonMode) {
			tui.newline();
			tui.output(tui.bold('Agentuity Coder plugin installed successfully!'));
			tui.newline();

			tui.info('To use the plugin, start Claude Code with:');
			tui.output(`  ${tui.ICONS.bullet} ${tui.bold(`claude --plugin-dir ${pluginPath}`)}`);
			tui.newline();

			tui.info('Or install permanently via the Claude Code marketplace:');
			tui.output(`  ${tui.ICONS.bullet} ${tui.bold('/plugin marketplace add agentuity/sdk')}`);
			tui.output(
				`  ${tui.ICONS.bullet} ${tui.bold('/plugin install agentuity-coder@agentuity')}`
			);
			tui.newline();

			tui.info('Available commands in Claude Code:');
			tui.output(
				`  ${tui.ICONS.bullet} ${tui.muted('/agentuity-coder')} - Run a task with the agent team`
			);
			tui.output(
				`  ${tui.ICONS.bullet} ${tui.muted('/agentuity-cadence')} - Start autonomous long-running task`
			);
			tui.output(
				`  ${tui.ICONS.bullet} ${tui.muted('/agentuity-memory-save')} - Save session context to memory`
			);
			tui.newline();
		}

		return { success: true, orgId, pluginPath };
	},
});

export default installSubcommand;
