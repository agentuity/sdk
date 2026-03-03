import { getPackageName } from './version.ts';
import { getInstallationType } from './utils/installation-type.ts';

let cachedPrefix: string | null = null;

/**
 * Detects how the CLI is being invoked and returns the appropriate command prefix.
 * Returns "agentuity" if installed globally, or "bunx @agentuity/cli" if running locally.
 */
export function getCommandPrefix(): string {
	if (cachedPrefix) {
		return cachedPrefix;
	}

	const installationType = getInstallationType();

	if (installationType === 'global') {
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
