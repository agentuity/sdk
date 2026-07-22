/**
 * Monorepo workspace detection.
 *
 * Walks up from a project directory looking for a workspace root marker —
 * either `pnpm-workspace.yaml` or a `package.json` with a `workspaces` field
 * (npm, yarn, bun). Returns a `MonorepoContext` describing the monorepo
 * root, the package manager, and the subpath of the target project within
 * the workspace.
 *
 * The rest of the build pipeline uses this context to:
 * 1. Run `install` at the monorepo root (so workspace deps resolve).
 * 2. Build the target package via the pm's workspace filter.
 * 3. Zip the monorepo tree (not just the subpackage) into `.agentuity/`.
 * 4. Emit `launch.json` with `processes[].workingDirectory = subpath`, so
 *    pilot starts the app from inside the right subdirectory.
 *
 * Returns `null` when the project is not part of a workspace, or when
 * `projectDir` *is* the workspace root (single-package mode, or a
 * monorepo-root deploy without a sub-target — out of scope here).
 */

import { readFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { pathExists } from '../../../node-compat/fs.ts';
import type { PackageManager } from './types.ts';

/**
 * Result of monorepo detection.
 *
 * `subpath` is always a posix-style relative path (forward slashes) so it
 * can be written directly into `launch.json` and survive a tar/zip round
 * trip onto a Linux container without OS-specific path mangling.
 */
export interface MonorepoContext {
	/** Absolute path to the monorepo root. */
	root: string;
	/**
	 * Posix-style path from `root` to the target project (no leading or
	 * trailing slash). Empty string would mean "the root itself", but the
	 * detector returns `null` in that case rather than an empty subpath.
	 */
	subpath: string;
	/** Package manager driving the workspace. */
	packageManager: PackageManager;
}

/**
 * Safety cap on the upward walk. A real monorepo is rarely more than 5
 * levels deep; 20 is comfortably past that without risking an infinite
 * loop on a malformed filesystem.
 */
const MAX_PARENTS = 20;

/**
 * Parse a `package.json`'s `workspaces` field. Accepts both shapes
 * documented across the pm ecosystem:
 *
 *   "workspaces": ["packages/*"]
 *   "workspaces": { "packages": ["packages/*"] }    // yarn classic shape
 *
 * Returns `null` when the field is absent or unparsable so callers can
 * skip the file cleanly.
 */
function readWorkspacePatterns(pkgJson: unknown): string[] | null {
	if (!pkgJson || typeof pkgJson !== 'object') return null;
	const ws = (pkgJson as { workspaces?: unknown }).workspaces;
	if (Array.isArray(ws)) {
		return ws.filter((v): v is string => typeof v === 'string');
	}
	if (ws && typeof ws === 'object') {
		const packages = (ws as { packages?: unknown }).packages;
		if (Array.isArray(packages)) {
			return packages.filter((v): v is string => typeof v === 'string');
		}
	}
	return null;
}

/**
 * Minimal `pnpm-workspace.yaml` package-pattern parser.
 * Handles the common `packages:` list form used by pnpm workspaces.
 */
function readPnpmWorkspacePatterns(yamlText: string): string[] {
	const patterns: string[] = [];
	let inPackages = false;
	for (const rawLine of yamlText.split(/\r?\n/)) {
		const line = rawLine.replace(/#.*$/, '');
		if (/^\s*packages\s*:\s*$/.test(line)) {
			inPackages = true;
			continue;
		}
		if (!inPackages) continue;
		// Next top-level key ends the packages list.
		if (/^\S/.test(line) && !/^\s*-\s*/.test(line)) {
			break;
		}
		const item = line.match(/^\s*-\s*['"]?([^'"]+?)['"]?\s*$/);
		if (item?.[1]) patterns.push(item[1]);
	}
	return patterns;
}

/**
 * True when `subpath` (posix, relative to workspace root) matches a workspace
 * glob such as `packages/*`, `apps/**`, or an exact name like `docs`.
 *
 * Directories that merely live under a monorepo root but are not workspace
 * members (e.g. CI smoke apps created next to `packages/`) must not trigger
 * monorepo packaging — that ships the whole tree with a non-member
 * `workingDirectory` and breaks Hadron readiness.
 */
export function matchesWorkspacePattern(subpath: string, pattern: string): boolean {
	const normalizedSubpath = subpath.replace(/^\/+|\/+$/g, '');
	const normalizedPattern = pattern.replace(/^\/+|\/+$/g, '');
	if (!normalizedSubpath || !normalizedPattern) return false;

	// Escape regex metacharacters, then expand * / ** as path globs.
	const escaped = normalizedPattern
		.replace(/[.+^${}()|[\]\\]/g, '\\$&')
		.replace(/\*\*/g, '<<<GLOBSTAR>>>')
		.replace(/\*/g, '[^/]+')
		.replace(/<<<GLOBSTAR>>>/g, '.*');
	return new RegExp(`^${escaped}$`).test(normalizedSubpath);
}

export function isWorkspaceMember(subpath: string, patterns: string[]): boolean {
	return patterns.some((pattern) => matchesWorkspacePattern(subpath, pattern));
}

/**
 * Choose the package manager when the root is identified by a
 * `package.json:workspaces` (i.e. not the pnpm marker case). We trust
 * the most specific lockfile present at the root, falling back to npm.
 *
 * `pnpm-lock.yaml` without `pnpm-workspace.yaml` is unusual but valid —
 * pnpm reads `workspaces` from `package.json` when the dedicated yaml
 * file is absent.
 */
async function detectPackageManagerAtRoot(root: string): Promise<PackageManager> {
	if ((await pathExists(join(root, 'bun.lockb'))) || (await pathExists(join(root, 'bun.lock')))) {
		return 'bun';
	}
	if (await pathExists(join(root, 'pnpm-lock.yaml'))) return 'pnpm';
	if (await pathExists(join(root, 'yarn.lock'))) return 'yarn';
	// package-lock.json or no lockfile at all → npm. Bare workspaces
	// without a lockfile happen on fresh scaffolds; npm is the most
	// conservative default.
	return 'npm';
}

/**
 * Read and JSON-parse a file, returning `null` on any failure
 * (missing file, malformed JSON, permission error). Callers should
 * treat a `null` result as "this isn't the marker file you're looking for".
 */
async function readJsonSafe(path: string): Promise<unknown | null> {
	try {
		const raw = await readFile(path, 'utf-8');
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

/**
 * Detect the enclosing monorepo, if any.
 *
 * Walks from `projectDir` toward `/`, stopping at the first directory
 * that contains either:
 *   - `pnpm-workspace.yaml`, or
 *   - a `package.json` with a `workspaces` array (or `{ packages: [...] }`).
 *
 * The project must also match a workspace package pattern. Nested dirs that
 * are not workspace members (CI smoke apps under a monorepo clone, scratch
 * folders, etc.) return `null` so deploy packages only that project.
 *
 * Returns `null` if no marker is found, or if the marker happens to sit
 * at `projectDir` itself (in that case the user is deploying the
 * monorepo root directly — not the subpackage flow this function
 * exists to support).
 */
export async function detectMonorepoContext(projectDir: string): Promise<MonorepoContext | null> {
	let current = projectDir;
	for (let i = 0; i < MAX_PARENTS; i++) {
		// pnpm marker
		const pnpmWorkspacePath = join(current, 'pnpm-workspace.yaml');
		if (await pathExists(pnpmWorkspacePath)) {
			if (current === projectDir) return null;
			const subpath = toPosix(relative(current, projectDir));
			try {
				const yamlText = await readFile(pnpmWorkspacePath, 'utf-8');
				const patterns = readPnpmWorkspacePatterns(yamlText);
				// Empty/unparsed patterns: keep prior behavior (treat as monorepo).
				if (patterns.length > 0 && !isWorkspaceMember(subpath, patterns)) {
					return null;
				}
			} catch {
				// Unreadable yaml — fall through to monorepo context.
			}
			return {
				root: current,
				subpath,
				packageManager: 'pnpm',
			};
		}

		// npm / yarn / bun marker — package.json with a `workspaces` field.
		const pkgJsonPath = join(current, 'package.json');
		if (await pathExists(pkgJsonPath)) {
			const patterns = readWorkspacePatterns(await readJsonSafe(pkgJsonPath));
			if (patterns && patterns.length > 0) {
				if (current === projectDir) return null;
				const subpath = toPosix(relative(current, projectDir));
				if (!isWorkspaceMember(subpath, patterns)) {
					return null;
				}
				return {
					root: current,
					subpath,
					packageManager: await detectPackageManagerAtRoot(current),
				};
			}
		}

		const parent = dirname(current);
		if (parent === current) return null; // hit filesystem root
		current = parent;
	}
	return null;
}

/** Convert OS-native separators to posix. */
function toPosix(p: string): string {
	if (sep === '/') return p;
	return p.split(sep).join('/');
}
