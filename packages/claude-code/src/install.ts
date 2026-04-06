/**
 * @agentuity/claude-code - Agentuity plugin for Claude Code
 *
 * Install script that configures the plugin for the current project.
 * Sets up permissions for Agentuity Cloud CLI commands.
 */

import { join } from 'node:path';
import { homedir } from 'node:os';

export interface InstallConfig {
	projectId?: string;
	orgId?: string;
	region?: string;
}

interface ClaudeSettings {
	permissions?: {
		allow?: string[];
		deny?: string[];
		ask?: string[];
	};
	[key: string]: unknown;
}

const AGENTUITY_PERMISSIONS = ['Bash(agentuity cloud *)', 'Bash(agentuity auth whoami *)'];

const AGENTUITY_DENY_PERMISSIONS = [
	'Bash(agentuity cloud secrets *)',
	'Bash(agentuity cloud secret *)',
	'Bash(agentuity cloud apikey *)',
	'Bash(agentuity auth token *)',
];

/**
 * Read agentuity.json from the current project if it exists.
 */
export async function readProjectConfig(): Promise<InstallConfig> {
	try {
		const file = Bun.file('agentuity.json');
		if (await file.exists()) {
			const config = await file.json();
			return {
				projectId: config.projectId,
				orgId: config.orgId,
				region: config.region,
			};
		}
	} catch {
		// No agentuity.json found or invalid
	}
	return {};
}

/**
 * Read a Claude Code settings JSON file.
 */
async function readSettings(path: string): Promise<ClaudeSettings> {
	try {
		const file = Bun.file(path);
		if (await file.exists()) {
			return await file.json();
		}
	} catch {
		// File doesn't exist or is invalid
	}
	return {};
}

/**
 * Write a Claude Code settings JSON file.
 */
async function writeSettings(path: string, settings: ClaudeSettings): Promise<void> {
	await Bun.write(path, JSON.stringify(settings, null, 2) + '\n');
}

/**
 * Ensure Agentuity Cloud permissions are configured in Claude Code settings.
 * Adds allow rules for agentuity cloud commands and deny rules for sensitive ones.
 */
async function configurePermissions(): Promise<{ added: number }> {
	const settingsPath = join(homedir(), '.claude', 'settings.local.json');
	const settings = await readSettings(settingsPath);

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

	for (const perm of AGENTUITY_PERMISSIONS) {
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

	if (added > 0) {
		await writeSettings(settingsPath, settings);
	}

	return { added };
}

/**
 * Install the Agentuity plugin.
 * This is called when the plugin is first installed.
 */
export async function install(): Promise<void> {
	const config = await readProjectConfig();

	// Configure Claude Code permissions for Agentuity Cloud commands
	const { added } = await configurePermissions();
	if (added > 0) {
		console.log(`Configured ${added} permission rules for Agentuity Cloud commands`);
	}

	if (config.projectId) {
		console.log(`Agentuity plugin configured for project: ${config.projectId}`);
	} else {
		console.log('Agentuity plugin installed');
	}
}

export default install;
