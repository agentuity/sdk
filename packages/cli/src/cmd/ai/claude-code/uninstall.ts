import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createSubcommand, type CommandContext } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import {
	type ClaudeSettings,
	CLAUDE_SETTINGS_FILE,
	PLUGIN_INSTALL_DIR,
	AGENTUITY_ALLOW_PERMISSIONS,
	AGENTUITY_DENY_PERMISSIONS,
} from './constants';

export const uninstallSubcommand = createSubcommand({
	name: 'uninstall',
	description: 'Uninstall Agentuity Coder plugin for Claude Code',
	tags: ['fast'],
	examples: [
		{
			command: getCommand('ai claude-code uninstall'),
			description: 'Uninstall Agentuity Coder plugin for Claude Code',
		},
	],
	async handler(ctx: CommandContext) {
		const { options } = ctx;
		const jsonMode = !!options?.json;

		if (!jsonMode) {
			tui.newline();
			tui.output(tui.bold('Uninstalling Agentuity Coder plugin for Claude Code'));
			tui.newline();
		}

		let removedPlugin = false;
		let removedPermissions = false;

		if (await Bun.file(`${PLUGIN_INSTALL_DIR}/package.json`).exists()) {
			try {
				rmSync(PLUGIN_INSTALL_DIR, { recursive: true, force: true });
				removedPlugin = true;
				if (!jsonMode) {
					tui.success('Removed plugin installation directory');
				}
			} catch (error) {
				if (!jsonMode) {
					tui.warning(`Failed to remove plugin directory: ${error}`);
				}
			}
		} else {
			if (!jsonMode) {
				tui.info('Plugin installation directory not found - nothing to remove');
			}
		}

		if (await Bun.file(CLAUDE_SETTINGS_FILE).exists()) {
			try {
				const content = readFileSync(CLAUDE_SETTINGS_FILE, 'utf-8');
				const settings: ClaudeSettings = JSON.parse(content);

				if (settings.permissions) {
					const allPerms = [...AGENTUITY_ALLOW_PERMISSIONS, ...AGENTUITY_DENY_PERMISSIONS];

					if (settings.permissions.allow) {
						const originalAllowLen = settings.permissions.allow.length;
						settings.permissions.allow = settings.permissions.allow.filter(
							(p) => !allPerms.includes(p)
						);
						if (settings.permissions.allow.length < originalAllowLen) {
							removedPermissions = true;
						}
					}

					if (settings.permissions.deny) {
						const originalDenyLen = settings.permissions.deny.length;
						settings.permissions.deny = settings.permissions.deny.filter(
							(p) => !allPerms.includes(p)
						);
						if (settings.permissions.deny.length < originalDenyLen) {
							removedPermissions = true;
						}
					}

					if (removedPermissions) {
						writeFileSync(CLAUDE_SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`);
						if (!jsonMode) {
							tui.success('Removed Agentuity permissions from Claude Code settings');
						}
					} else {
						if (!jsonMode) {
							tui.info('No Agentuity permissions found in Claude Code settings');
						}
					}
				}
			} catch (error) {
				if (!jsonMode) {
					tui.warning(`Failed to update Claude Code settings: ${error}`);
				}
			}
		} else {
			if (!jsonMode) {
				tui.info('Claude Code settings file not found');
			}
		}

		if (!jsonMode) {
			tui.newline();

			if (removedPlugin || removedPermissions) {
				tui.output(tui.bold('Agentuity Coder plugin uninstalled successfully'));
			} else {
				tui.output(tui.bold('Agentuity Coder plugin was not installed'));
			}

			tui.newline();
			tui.info(`To reinstall, run: ${tui.bold(getCommand('ai claude-code install'))}`);
			tui.newline();
		}

		return { success: true, removedPlugin, removedPermissions };
	},
});

export default uninstallSubcommand;
