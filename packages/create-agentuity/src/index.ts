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
/**
 * Package managers we know how to dispatch a one-off package execution
 * through. Yarn is split because Classic (1.x) has no `dlx` command, so it
 * must fall back to `npx`, while Berry (2+) uses `yarn dlx`.
 */
export type PackageManager = 'bun' | 'npm' | 'pnpm' | 'yarn' | 'yarn-classic';

/**
 * Identify the package manager that invoked us from `npm_config_user_agent`.
 *
 * Every supported package manager sets this env var when running
 * `<pm> create agentuity` / `<pm> dlx` / `npx`, in the form
 * `name/version node/version ...` (e.g. `pnpm/8.15.4 npm/? node/v20.11.1`).
 * Yarn 1.x is reported as `yarn-classic` because it lacks `yarn dlx`.
 * Returns `undefined` when the var is absent or unrecognized, so callers
 * can fall back to a safe default.
 */
export function detectPackageManager(userAgent: string | undefined): PackageManager | undefined {
	if (!userAgent) return undefined;
	const [name, version] = userAgent.split(' ')[0]?.split('/') ?? [];
	switch (name?.toLowerCase()) {
		case 'bun':
			return 'bun';
		case 'npm':
			return 'npm';
		case 'pnpm':
			return 'pnpm';
		case 'yarn':
			// Yarn Classic (1.x) has no `dlx`; treat it separately so we can
			// route it through npx instead.
			return version?.startsWith('1.') ? 'yarn-classic' : 'yarn';
		default:
			return undefined;
	}
}

/**
 * Build the command + args that run `@agentuity/cli@<version> create ...`
 * through the given package manager's one-off execution tool.
 *
 *   bun           → bunx @agentuity/cli@<v> create ...
 *   pnpm          → pnpm dlx @agentuity/cli@<v> create ...
 *   yarn (Berry)  → yarn dlx @agentuity/cli@<v> create ...
 *   npm / yarn 1.x → npx --yes @agentuity/cli@<v> create ...
 *
 * Defaults to `npx` when the package manager is unknown (or is Yarn Classic,
 * which has no `dlx`), because the wrapper runs under `#!/usr/bin/env node`,
 * so Node (and therefore npx) is guaranteed to be present even when Bun is
 * not installed.
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
