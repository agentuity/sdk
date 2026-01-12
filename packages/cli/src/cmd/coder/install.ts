import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createSubcommand, type CommandContext } from '../../types';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';
import { listOrganizations } from '@agentuity/server';
import { saveOrgId, saveConfig } from '../../config';

const OPENCODE_CONFIG_DIR = join(homedir(), '.config', 'opencode');
const OPENCODE_CONFIG_FILE = join(OPENCODE_CONFIG_DIR, 'opencode.json');

export const installSubcommand = createSubcommand({
	name: 'install',
	description: 'Install Agentuity Coder plugin into Open Code',
	tags: ['fast'],
	requires: { auth: true, apiClient: true },
	examples: [
		{
			command: getCommand('coder install'),
			description: 'Install Agentuity Coder into Open Code',
		},
	],
	async handler(ctx: CommandContext<{ auth: true; apiClient: true }>) {
		const { apiClient, config } = ctx;

		tui.newline();
		tui.output(tui.bold('Installing Agentuity Coder'));
		tui.newline();

		// Step 1: Determine org - use existing or prompt
		let orgId = config?.coder?.org ?? config?.preferences?.orgId;
		let orgChanged = false;

		if (!orgId) {
			tui.output(`${tui.ICONS.arrow} Checking organization...`);
			const orgs = await tui.spinner({
				message: 'Fetching organizations',
				clearOnSuccess: true,
				callback: async () => {
					return listOrganizations(apiClient);
				},
			});

			if (orgs.length === 0) {
				tui.error('No organizations found for your account.');
				tui.info('Please create an organization at https://agentuity.com');
				return { success: false };
			}

			if (orgs.length === 1) {
				orgId = orgs[0].id;
			} else {
				orgId = await tui.selectOrganization(orgs, undefined);
			}
			orgChanged = true;
		}
		tui.success(`Using organization: ${orgId}`);

		// Step 2: Determine plugin entry based on config
		const coderSource = config?.coder?.source ?? 'npm';
		const coderPath = config?.coder?.path;

		let pluginEntry: string;
		if (coderSource === 'local' && coderPath) {
			pluginEntry = coderPath;
			tui.info(`Source: local (${coderPath})`);
		} else {
			pluginEntry = '@agentuity/coder';
			tui.info('Source: npm (@agentuity/coder)');
		}

		// Step 3: Update Open Code config if needed
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

		// Check if there's a different coder entry that needs updating
		const existingCoderIndex = openCodeConfig.plugin.findIndex(
			(p) => p === '@agentuity/coder' || p.includes('packages/coder')
		);

		if (hasExactEntry) {
			tui.info('Open Code plugin already configured');
		} else if (existingCoderIndex >= 0) {
			// Update existing entry to new value
			openCodeConfig.plugin[existingCoderIndex] = pluginEntry;
			writeFileSync(OPENCODE_CONFIG_FILE, JSON.stringify(openCodeConfig, null, 2));
			tui.success(`Updated Open Code plugin to: ${pluginEntry}`);
			openCodeUpdated = true;
		} else {
			// Add new entry
			openCodeConfig.plugin.push(pluginEntry);
			writeFileSync(OPENCODE_CONFIG_FILE, JSON.stringify(openCodeConfig, null, 2));
			tui.success(`Added ${pluginEntry} to Open Code config`);
			openCodeUpdated = true;
		}

		// Step 4: Update profile config if org changed
		let profileUpdated = false;
		if (orgChanged && config) {
			const updatedConfig = {
				...config,
				coder: {
					...config.coder,
					org: orgId,
				},
			};
			await saveConfig(updatedConfig);
			tui.success('Saved organization to profile');
			profileUpdated = true;
		} else if (orgChanged) {
			await saveOrgId(orgId);
			tui.success('Saved organization to profile');
			profileUpdated = true;
		}

		// Summary
		tui.newline();
		if (openCodeUpdated || profileUpdated) {
			tui.output(tui.bold('Agentuity Coder installed successfully!'));
		} else {
			tui.output(tui.bold('Agentuity Coder already installed'));
		}

		tui.newline();
		if (coderSource === 'npm') {
			tui.output(tui.muted('For local development, add to your profile config:'));
			tui.output(tui.muted('  coder:'));
			tui.output(tui.muted('    source: local'));
			tui.output(tui.muted('    path: /path/to/sdk/packages/coder'));
			tui.newline();
		}

		tui.info('Next steps:');
		tui.output(`  ${tui.ICONS.bullet} Start Open Code to use Agentuity Coder agents`);
		tui.output(
			`  ${tui.ICONS.bullet} Run ${tui.bold(getCommand('coder run "<task>"'))} to execute tasks`
		);
		tui.newline();

		tui.output(tui.muted('📡 Recommended MCP servers for Scout/Expert agents:'));
		tui.output(tui.muted('Add to your opencode.json:'));
		tui.newline();
		tui.output(tui.muted('  "mcp": {'));
		tui.output(tui.muted('    "context7": { "type": "remote", "url": "https://mcp.context7.com/mcp" },'));
		tui.output(tui.muted('    "grep_app": { "type": "remote", "url": "https://mcp.grep.app" }'));
		tui.output(tui.muted('  }'));
		tui.newline();

		return { success: true, orgId, source: coderSource, path: coderPath };
	},
});

export default installSubcommand;
