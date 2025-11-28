import path from 'node:path';
import { getPackageName } from './version';

let cachedPrefix: string | null = null;

/**
 * Detects how the CLI is being invoked and returns the appropriate command prefix.
 * Returns "agentuity" if installed globally, or "bunx @agentuity/cli" if running via bunx.
 */
export function getCommandPrefix(): string {
	if (cachedPrefix) {
		return cachedPrefix;
	}

	// Check if running from a globally installed package
	// When installed globally, the process.argv[1] will be in a bin directory
	const scriptPath = process.argv[1] || '';
	const normalized = path.normalize(scriptPath);

	// If we have AGENTUITY_CLI_VERSION set we are running from compiled binary OR
	// If the script is in node_modules/.bin or a global bin directory, it's likely global
	const isGlobal =
		process.env.AGENTUITY_CLI_VERSION ||
		(normalized.includes(`${path.sep}bin${path.sep}`) &&
			!normalized.includes(`${path.sep}node_modules${path.sep}`) &&
			!normalized.includes(path.join('packages', 'cli', 'bin')));

	if (isGlobal) {
		cachedPrefix = 'agentuity';
	} else {
		// Running locally via bunx or from source
		const pkgName = getPackageName();
		cachedPrefix = `bunx ${pkgName}`;
	}

	return cachedPrefix;
}

/**
 * Gets a formatted command string with the appropriate prefix.
 * Example: getCommand('auth login') => 'agentuity auth login' or 'bunx @agentuity/cli auth login'
 */
export function getCommand(command: string): string {
	return `${getCommandPrefix()} ${command}`;
}
