/**
 * Deploy ignore patterns for monorepo staging.
 *
 * Loads `.agentuityignore` (gitignore syntax) from the monorepo root
 * and target project directory, then matches paths relative to the
 * monorepo root. Built-in safety exclusions always apply and cannot
 * be re-included with negation.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, relative, resolve as resolvePath, sep } from 'node:path';
import ignore, { type Ignore } from 'ignore';
import { ALWAYS_IGNORE_PATTERNS, isAlwaysSkippedSegment } from './deploy-exclusions.ts';

/** Filename for user-authored deploy exclusion patterns. */
export const AGENTUITY_IGNORE_FILENAME = '.agentuityignore';

/** Why a path was excluded from monorepo staging (for trace logging). */
export type DeployIgnoreReason = 'built-in' | 'agentuityignore';

export interface DeployIgnoreMatcher {
	/**
	 * Classify a monorepo-root-relative path, or return null when kept.
	 * Directories may be tested with or without a trailing slash.
	 */
	classify(relPath: string, isDirectory?: boolean): DeployIgnoreReason | null;
	/** User-authored patterns only (excludes built-in safety patterns). */
	userPatterns: readonly string[];
	/** Absolute paths of `.agentuityignore` files that contributed patterns. */
	sources: readonly string[];
}

/** Convert an OS-native path to posix form (required by `ignore`). */
export function toPosixPath(p: string): string {
	if (sep === '/') return p;
	return p.split(sep).join('/');
}

/**
 * Parse `.agentuityignore` file text into non-empty, non-comment lines.
 */
export function parseAgentuityIgnore(content: string): string[] {
	const patterns: string[] = [];
	for (const rawLine of content.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) continue;
		patterns.push(line);
	}
	return patterns;
}

/**
 * Read and parse a single `.agentuityignore` file. Empty when missing.
 */
export function readAgentuityIgnoreFile(filePath: string): string[] {
	if (!existsSync(filePath)) return [];
	try {
		return parseAgentuityIgnore(readFileSync(filePath, 'utf-8'));
	} catch {
		return [];
	}
}

/**
 * Collect user patterns from known locations.
 *
 * Search order (later files append; gitignore last-match wins):
 *   1. `<monorepoRoot>/.agentuityignore`
 *   2. `<projectDir>/.agentuityignore` (when different from the root)
 *
 * All patterns are matched against paths relative to the monorepo root.
 */
export function loadDeployIgnorePatterns(
	monorepoRoot: string,
	projectDir?: string
): { userPatterns: string[]; sources: string[] } {
	const userPatterns: string[] = [];
	const sources: string[] = [];

	const roots = [resolvePath(monorepoRoot)];
	if (projectDir) {
		const absProject = resolvePath(projectDir);
		const absRoot = roots[0]!;
		if (toPosixPath(relative(absRoot, absProject)) !== '' && absProject !== absRoot) {
			roots.push(absProject);
		}
	}

	for (const root of roots) {
		const filePath = join(root, AGENTUITY_IGNORE_FILENAME);
		const fromFile = readAgentuityIgnoreFile(filePath);
		if (fromFile.length > 0) {
			userPatterns.push(...fromFile);
			sources.push(filePath);
		}
	}

	return { userPatterns, sources };
}

function patternMatches(ig: Ignore, posix: string, isDirectory: boolean): boolean {
	if (ig.ignores(posix)) return true;
	if (isDirectory && !posix.endsWith('/') && ig.ignores(`${posix}/`)) return true;
	return false;
}

export interface CreateDeployIgnoreMatcherOptions {
	/** User-authored patterns (from `.agentuityignore`). */
	userPatterns?: readonly string[];
	/** Absolute paths of files that contributed user patterns. */
	sources?: readonly string[];
	/**
	 * Built-in gitignore patterns. Defaults to {@link ALWAYS_IGNORE_PATTERNS}.
	 * Rarely overridden (tests).
	 */
	builtInPatterns?: readonly string[];
}

/**
 * Build a matcher with an explicit built-in vs user split.
 */
export function createDeployIgnoreMatcher(
	options: CreateDeployIgnoreMatcherOptions = {}
): DeployIgnoreMatcher {
	const userPatterns = options.userPatterns ?? [];
	const sources = options.sources ?? [];
	const builtInPatterns = options.builtInPatterns ?? ALWAYS_IGNORE_PATTERNS;

	const builtInIg: Ignore = ignore();
	if (builtInPatterns.length > 0) {
		builtInIg.add([...builtInPatterns]);
	}
	const userIg: Ignore = ignore();
	if (userPatterns.length > 0) {
		userIg.add([...userPatterns]);
	}

	function classify(relPath: string, isDirectory = false): DeployIgnoreReason | null {
		const posix = toPosixPath(relPath).replace(/^\.\/+/, '');
		if (!posix || posix === '.') return null;

		for (const segment of posix.split('/')) {
			if (isAlwaysSkippedSegment(segment)) return 'built-in';
		}

		if (patternMatches(builtInIg, posix, isDirectory)) return 'built-in';
		if (patternMatches(userIg, posix, isDirectory)) return 'agentuityignore';
		return null;
	}

	return {
		userPatterns,
		sources,
		classify,
	};
}

/** Load `.agentuityignore` files (if any) and return a ready matcher. */
export function loadDeployIgnoreMatcher(
	monorepoRoot: string,
	projectDir?: string
): DeployIgnoreMatcher {
	const { userPatterns, sources } = loadDeployIgnorePatterns(monorepoRoot, projectDir);
	return createDeployIgnoreMatcher({ userPatterns, sources });
}
