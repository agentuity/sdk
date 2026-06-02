/**
 * Derive the npm dist-tag from the create-agentuity version.
 *
 * Since create-agentuity and @agentuity/cli are published in lockstep
 * under the same dist-tag, we use the prerelease identifier to determine
 * which tag to install from:
 *
 *   bun create agentuity@^3.0.0-alpha.0  → @agentuity/cli@alpha
 *   bun create agentuity@^2.0.0-beta.1   → @agentuity/cli@beta
 *   bun create agentuity@^2.0.0-rc.2     → @agentuity/cli@rc
 *   bun create agentuity                  → @agentuity/cli@latest
 *   bun create agentuity@2.0.2           → @agentuity/cli@2.0.2 (exact)
 *
 * For stable versions (no prerelease), we use the exact version number
 * so that `bun create agentuity@2.0.2` pins to that specific CLI version.
 */
export function getCliVersionSpecifier(version: string): string {
	// Prerelease: extract the tag from the prerelease identifier
	const match = version.match(/-([a-zA-Z]+)/);
	if (match?.[1]) {
		return match[1].toLowerCase();
	}
	// Stable versions: use the exact version to ensure major version compatibility
	return version;
}

/** Package managers we know how to dispatch a one-off package execution through. */
export type PackageManager = 'bun' | 'npm' | 'pnpm' | 'yarn';

/**
 * Identify the package manager that invoked us from `npm_config_user_agent`.
 *
 * Every supported package manager sets this env var when running
 * `<pm> create agentuity` / `<pm> dlx` / `npx`, in the form
 * `name/version node/version ...` (e.g. `pnpm/8.15.4 npm/? node/v20.11.1`).
 * Returns `undefined` when the var is absent or unrecognized, so callers
 * can fall back to a safe default.
 */
export function detectPackageManager(userAgent: string | undefined): PackageManager | undefined {
	if (!userAgent) return undefined;
	const name = userAgent.split('/')[0]?.toLowerCase();
	if (name === 'bun' || name === 'npm' || name === 'pnpm' || name === 'yarn') {
		return name;
	}
	return undefined;
}

/**
 * Build the command + args that run `@agentuity/cli@<version> create ...`
 * through the given package manager's one-off execution tool.
 *
 *   bun   → bunx @agentuity/cli@<v> create ...
 *   pnpm  → pnpm dlx @agentuity/cli@<v> create ...
 *   yarn  → yarn dlx @agentuity/cli@<v> create ...
 *   npm   → npx --yes @agentuity/cli@<v> create ...
 *
 * Defaults to `npx` when the package manager is unknown, because the
 * wrapper runs under `#!/usr/bin/env node`, so Node (and therefore npx)
 * is guaranteed to be present even when Bun is not installed.
 */
export function getCreateCommand(
	pm: PackageManager | undefined,
	cliPackage: string,
	args: string[]
): { command: string; args: string[] } {
	const create = [cliPackage, 'create', ...args];
	switch (pm) {
		case 'bun':
			return { command: 'bunx', args: create };
		case 'pnpm':
			return { command: 'pnpm', args: ['dlx', ...create] };
		case 'yarn':
			return { command: 'yarn', args: ['dlx', ...create] };
		default:
			return { command: 'npx', args: ['--yes', ...create] };
	}
}
