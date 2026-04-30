import { satisfies } from 'semver';
import { runtimeKind, runtimeVersion } from './node-compat/runtime-info.ts';

const MIN_BUN_VERSION = '>=1.3.3';
const MIN_NODE_VERSION = '>=24.0.0';
const MIN_GRAVITY_VERSION = '>=1.0.6';

export function isBun(): boolean {
	return runtimeKind() === 'bun';
}

/**
 * Validate that the host runtime is recent enough.
 *
 * Under Bun: requires `MIN_BUN_VERSION`. Under Node: requires
 * `MIN_NODE_VERSION` (Node 24+, where stable native TypeScript
 * stripping and `node:sqlite` land). Older runtimes exit immediately
 * with a descriptive error.
 */
export function validateRuntime(): void {
	const kind = runtimeKind();
	const version = runtimeVersion();

	if (kind === 'bun') {
		if (!satisfies(version, MIN_BUN_VERSION)) {
			console.error(`Error: This CLI requires Bun ${MIN_BUN_VERSION}`);
			console.error(`Current Bun version: ${version}`);
			process.exit(1);
		}
		return;
	}

	// Node (or some other Node-API-compatible runtime). Validate against
	// the minimum Node version we test on; older Nodes lack ESM features
	// and `node:sqlite` that this CLI depends on.
	if (!satisfies(version, MIN_NODE_VERSION)) {
		console.error(
			`Error: This CLI requires Node.js ${MIN_NODE_VERSION} or Bun ${MIN_BUN_VERSION}`
		);
		console.error(`Current Node version: ${version}`);
		process.exit(1);
	}
}

/**
 * Returns true if the gravity binary requires an upgrade
 *
 * @param version current version
 * @returns
 */
export function validateGravityRequiresUpgrade(version: string): boolean {
	return satisfies(version, MIN_GRAVITY_VERSION) === false;
}
