import { runtimeKind } from './node-compat/runtime-info.ts';
import { getInstallationType } from './utils/installation-type.ts';
import { getPackageName } from './version.ts';

let cachedPrefix: string | null = null;

/**
 * Detects how the CLI is being invoked and returns the appropriate command prefix.
 *
 * - `agentuity` when installed globally (any runtime).
 * - `bunx <pkg>` when running under Bun from source or `node_modules`.
 * - `npx <pkg>` when running under Node from source or `node_modules`.
 *
 * Picking the right tool matters for the example commands we render in
 * `ai intro` / `ai prompt llm` / help output — telling a Node user
 * to run `bunx ...` is wrong (it requires Bun to be installed) and
 * vice-versa. We base the choice on the host runtime, not on which
 * package manager spawned us, because we can introspect the runtime
 * reliably while npm-vs-bun lifecycle scripts can't always be told
 * apart.
 */
export function getCommandPrefix(): string {
	if (cachedPrefix) {
		return cachedPrefix;
	}

	const installationType = getInstallationType();

	if (installationType === 'global') {
		cachedPrefix = 'agentuity';
	} else {
		const runner = runtimeKind() === 'bun' ? 'bunx' : 'npx';
		cachedPrefix = `${runner} ${getPackageName()}`;
	}

	return cachedPrefix;
}

/**
 * Gets a formatted command string with the appropriate prefix.
 * Example: getCommand('auth login') →
 *   - `agentuity auth login` (global install)
 *   - `bunx @agentuity/cli auth login` (Bun runtime)
 *   - `npx @agentuity/cli auth login` (Node runtime)
 */
export function getCommand(command: string): string {
	return `${getCommandPrefix()} ${command}`;
}
