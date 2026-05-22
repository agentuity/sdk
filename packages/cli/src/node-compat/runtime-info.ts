/**
 * Runtime introspection helpers.
 *
 * Centralizes reads of `Bun.version`, `Bun.revision`, `Bun.main`, and
 * `import.meta.dir` so that callers don't have to know which runtime
 * they're under. Returns Node-flavored values when running under
 * Node, Bun-flavored ones when running under Bun.
 */

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Which JavaScript runtime is hosting this process. */
export type RuntimeKind = 'bun' | 'node';

/** Detect the host runtime. */
export function runtimeKind(): RuntimeKind {
	return typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined' ? 'bun' : 'node';
}

/**
 * Version string of the host runtime, or `'unknown'` if it can't be
 * determined. Matches Bun's `Bun.version` (e.g. `'1.3.11'`) under Bun
 * and uses `process.versions.node` (e.g. `'24.0.2'`) under Node.
 */
export function runtimeVersion(): string {
	if (runtimeKind() === 'bun') {
		return (
			(globalThis as { Bun?: { version?: string } }).Bun?.version ??
			process.versions.node ??
			'unknown'
		);
	}
	return process.versions.node ?? 'unknown';
}

/**
 * Path to the entrypoint script of the current process. Replaces
 * `Bun.main` (which is the absolute path to the file passed to
 * `bun run`).
 *
 * Falls back to `process.argv[1]` when nothing better is available
 * (e.g. running via `node -e`).
 */
export function entryScriptPath(): string {
	return process.argv[1] ?? '';
}

/**
 * Directory of the file that owns the given `import.meta`. Drop-in
 * for `import.meta.dir` (Bun-only).
 *
 * Usage:
 *
 *   ```ts
 *   import { currentDir } from '../node-compat/runtime-info.ts';
 *   const here = currentDir(import.meta);
 *   ```
 */
export function currentDir(meta: ImportMeta): string {
	return dirname(fileURLToPath(meta.url));
}

/**
 * Best-effort git SHA for `--version` output. Bun bakes this in via
 * `Bun.revision`; under Node we don't have a comparable mechanism at
 * the runtime level, so we return `'unknown'` and let callers fall
 * back to a build-time-injected SHA if they have one.
 */
export function gitSha(): string {
	const bunRev = (globalThis as { Bun?: { revision?: string } }).Bun?.revision;
	if (bunRev) return bunRev.substring(0, 8);
	return 'unknown';
}
