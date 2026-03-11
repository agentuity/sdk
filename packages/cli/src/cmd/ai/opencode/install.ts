import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createSubcommand, type CommandContext } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';

const OPENCODE_CONFIG_DIR = join(homedir(), '.config', 'opencode');
const OPENCODE_CONFIG_FILE = join(OPENCODE_CONFIG_DIR, 'opencode.json');

export const installSubcommand = createSubcommand({
	name: 'install',
	description: 'Install Agentuity Open Code plugin',
	tags: ['fast'],
	requires: { auth: true, apiClient: true, org: true },
	examples: [
		{
			command: getCommand('ai opencode install'),
			description: 'Install Agentuity Open Code plugin',
		},
	],
	async handler(ctx: CommandContext<{ auth: true; apiClient: true; org: true }>) {
		const { options, orgId } = ctx;
		const jsonMode = !!options?.json;

		if (!jsonMode) {
			tui.newline();
			tui.output(tui.bold('Installing Agentuity Open Code plugin'));
			tui.newline();
			tui.success(`Using organization: ${orgId}`);
		}

		const pluginEntry = '@agentuity/opencode';

		// Update Open Code config if needed
		let openCodeUpdated = false;
		if (!existsSync(OPENCODE_CONFIG_DIR)) {
			mkdirSync(OPENCODE_CONFIG_DIR, { recursive: true });
		}

		let openCodeConfig: { plugin?: string[]; $schema?: string } = {};
		if (existsSync(OPENCODE_CONFIG_FILE)) {
			try {
				const content = readFileSync(OPENCODE_CONFIG_FILE, 'utf-8');
				openCodeConfig = JSON.parse(content);
			} catch {
				openCodeConfig = {};
			}
		}

		if (!openCodeConfig.plugin) {
			openCodeConfig.plugin = [];
		}

		// Check if the exact plugin entry already exists
		const hasExactEntry = openCodeConfig.plugin.includes(pluginEntry);

		// Check if there's an existing entry that needs updating
		const existingIndex = openCodeConfig.plugin.indexOf('@agentuity/opencode');

		if (hasExactEntry) {
			if (!jsonMode) {
				tui.info('Open Code plugin already configured');
			}
		} else if (existingIndex >= 0) {
			// Update existing entry to new value
			openCodeConfig.plugin[existingIndex] = pluginEntry;
			writeFileSync(OPENCODE_CONFIG_FILE, JSON.stringify(openCodeConfig, null, 2));
			if (!jsonMode) {
				tui.success(`Updated Open Code plugin to: ${pluginEntry}`);
			}
			openCodeUpdated = true;
		} else {
			// Add new entry
			openCodeConfig.plugin.push(pluginEntry);
			writeFileSync(OPENCODE_CONFIG_FILE, JSON.stringify(openCodeConfig, null, 2));
			if (!jsonMode) {
				tui.success(`Added ${pluginEntry} to Open Code config`);
			}
			openCodeUpdated = true;
		}

		// Summary (TUI only)
		if (!jsonMode) {
			tui.newline();
			if (openCodeUpdated) {
				tui.output(tui.bold('Agentuity Open Code plugin installed successfully!'));
			} else {
				tui.output(tui.bold('Agentuity Open Code plugin already installed'));
			}

			tui.newline();
			tui.info('Next steps:');
			tui.output(`  ${tui.ICONS.bullet} Start Open Code to use Agentuity Coder agents`);
			tui.output(
				`  ${tui.ICONS.bullet} Run ${tui.bold(getCommand('ai opencode run "<task>"'))} to execute tasks`
			);
			tui.newline();

			tui.output(tui.muted('Recommended MCP servers for Scout/Expert agents:'));
			tui.output(tui.muted(`Add to your opencode.json (${OPENCODE_CONFIG_FILE}):`));
			tui.newline();
			tui.output(tui.muted('  "mcp": {'));
			tui.output(
				tui.muted(
					'    "context7": { "type": "remote", "url": "https://mcp.context7.com/mcp" },'
				)
			);
			tui.output(
				tui.muted('    "grep_app": { "type": "remote", "url": "https://mcp.grep.app" }')
			);
			tui.output(tui.muted('  }'));
			tui.newline();
		}

		return { success: true, orgId };
	},
});

export default installSubcommand;
