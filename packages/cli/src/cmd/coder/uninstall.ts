import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';

const OPENCODE_CONFIG_DIR = join(homedir(), '.config', 'opencode');
const OPENCODE_CONFIG_FILE = join(OPENCODE_CONFIG_DIR, 'opencode.json');

async function fileExists(path: string): Promise<boolean> {
	return Bun.file(path).exists();
}

export const uninstallSubcommand = createSubcommand({
	name: 'uninstall',
	description: 'Uninstall Agentuity Coder plugin from Open Code',
	tags: ['fast'],
	examples: [
		{
			command: getCommand('coder uninstall'),
			description: 'Uninstall Agentuity Coder from Open Code',
		},
	],
	async handler(ctx) {
		const { options } = ctx;
		const jsonMode = !!options?.json;

		if (!jsonMode) {
			tui.newline();
			tui.output(tui.bold('Uninstalling Agentuity Coder'));
			tui.newline();
		}

		let removedFromOpenCode = false;

		// Remove from OpenCode config
		if (!(await fileExists(OPENCODE_CONFIG_FILE))) {
			if (!jsonMode) {
				tui.info('Open Code config not found - nothing to uninstall');
			}
		} else {
			try {
				const content = readFileSync(OPENCODE_CONFIG_FILE, 'utf-8');
				const openCodeConfig: { plugin?: string[]; $schema?: string } = JSON.parse(content);

				if (!openCodeConfig.plugin || openCodeConfig.plugin.length === 0) {
					if (!jsonMode) {
						tui.info('No plugins configured in Open Code');
					}
				} else {
					const originalLength = openCodeConfig.plugin.length;
					openCodeConfig.plugin = openCodeConfig.plugin.filter(
						(p) => p !== '@agentuity/coder' && !p.includes('packages/coder')
					);

					if (openCodeConfig.plugin.length < originalLength) {
						writeFileSync(OPENCODE_CONFIG_FILE, JSON.stringify(openCodeConfig, null, 2));
						if (!jsonMode) {
							tui.success('Removed Agentuity Coder from Open Code plugins');
						}
						removedFromOpenCode = true;
					} else {
						if (!jsonMode) {
							tui.info('Agentuity Coder not found in Open Code plugins');
						}
					}
				}
			} catch (error) {
				if (!jsonMode) {
					tui.warn(`Failed to parse Open Code config: ${error}`);
				}
			}
		}

		if (!jsonMode) {
			tui.newline();

			if (removedFromOpenCode) {
				tui.output(tui.bold('Agentuity Coder uninstalled successfully'));
			} else {
				tui.output(tui.bold('Agentuity Coder was not installed'));
			}

			tui.newline();
			tui.info(`To reinstall, run: ${tui.bold(getCommand('coder install'))}`);
			tui.newline();
		}

		return { success: true, removedFromOpenCode };
	},
});

export default uninstallSubcommand;
