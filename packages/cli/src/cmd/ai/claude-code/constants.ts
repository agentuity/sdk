import { homedir } from 'node:os';
import { join } from 'node:path';

export interface ClaudeSettings {
	permissions?: {
		allow?: string[];
		deny?: string[];
	};
	[key: string]: unknown;
}

export const CLAUDE_DIR = join(homedir(), '.claude');
export const CLAUDE_SETTINGS_FILE = join(CLAUDE_DIR, 'settings.local.json');
export const PLUGIN_INSTALL_DIR = join(homedir(), '.agentuity', 'plugins', 'claude-code');

export const AGENTUITY_ALLOW_PERMISSIONS = [
	'Bash(agentuity cloud *)',
	'Bash(agentuity auth whoami *)',
];

export const AGENTUITY_DENY_PERMISSIONS = [
	'Bash(agentuity cloud secrets *)',
	'Bash(agentuity cloud secret *)',
	'Bash(agentuity cloud apikey *)',
	'Bash(agentuity auth token *)',
];
