/**
 * Monorepo deploy staging: mirror the workspace root into the output
 * directory, applying `.agentuityignore` and built-in safety exclusions.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { Logger } from '@agentuity/core';
import {
	AGENTUITY_IGNORE_FILENAME,
	type DeployIgnoreMatcher,
	findRiskyBuildOutputIgnorePatterns,
	isProtectedStagingPath,
	loadDeployIgnoreMatcher,
	type ProtectedStagingPaths,
	resolveProtectedBuildOutputPath,
	toPosixPath,
} from '../deploy-ignore.ts';
import type { MonorepoContext } from '../detect/monorepo.ts';

/** Logger subset used while staging; `trace`/`warn` optional for test fixtures. */
export type MonorepoStageLogger = Pick<Logger, 'debug'> & Partial<Pick<Logger, 'trace' | 'warn'>>;

export interface CopyMonorepoTreeOptions {
	/**
	 * Optional pre-built ignore matcher. When omitted, patterns are
	 * loaded from `.agentuityignore` at the monorepo root (and the
	 * target project dir when provided via `projectDir`).
	 */
	ignore?: DeployIgnoreMatcher;
	/**
	 * Absolute path to the target subpackage. Used only to discover a
	 * project-local `.agentuityignore` when `ignore` is not passed.
	 */
	projectDir?: string;
	/**
	 * Framework build output dir relative to the target package
	 * (e.g. `dist`, `.output`). Used to protect that tree from bare
	 * ignore patterns like `dist/` that would match at any depth.
	 */
	buildOutput?: string;
}

/** Stats from a monorepo staging copy (directory hits count as one path). */
export interface CopyMonorepoTreeResult {
	skippedUser: number;
	skippedBuiltIn: number;
	/** User ignore hits overridden because the path is required to deploy. */
	protectedKept: number;
	userPatternCount: number;
	ignoreSources: readonly string[];
}

/**
 * Recursively copy the monorepo tree from `monorepo.root` into
 * `outputDir`, wiping any previous staging contents first.
 */
export function copyMonorepoTree(
	monorepo: MonorepoContext,
	outputDir: string,
	logger: MonorepoStageLogger,
	options: CopyMonorepoTreeOptions = {}
): CopyMonorepoTreeResult {
	const absOut = resolve(outputDir);
	const outRelToRoot = relative(monorepo.root, absOut);
	const outRelPosix = toPosixPath(outRelToRoot);

	if (existsSync(absOut)) {
		logger.debug(`Cleaning monorepo staging dir before copy: ${absOut}`);
		rmSync(absOut, { recursive: true, force: true });
	}
	mkdirSync(absOut, { recursive: true });

	const matcher = options.ignore ?? loadDeployIgnoreMatcher(monorepo.root, options.projectDir);

	const protect: ProtectedStagingPaths = {
		subpath: monorepo.subpath,
		buildOutput: options.buildOutput ?? '',
	};
	const protectedBuild = resolveProtectedBuildOutputPath(protect.subpath, protect.buildOutput);

	const risky = findRiskyBuildOutputIgnorePatterns(matcher.userPatterns, protect.buildOutput);
	if (risky.length > 0 && protectedBuild) {
		logger.warn?.(
			`.agentuityignore pattern(s) ${risky.map((p) => JSON.stringify(p)).join(', ')} ` +
				`would match the deploy package build output at ${protectedBuild}/; ` +
				`keeping ${protectedBuild}/ in the staging tree. Prefer a monorepo-root path ` +
				`like "dist/" only when it is not the app output, or scope excludes ` +
				`(e.g. "docs/dist/", "apps/other/dist/").`
		);
	}

	if (matcher.sources.length > 0) {
		logger.debug(
			`Deploy ignore: ${matcher.userPatterns.length} user pattern(s) from ${matcher.sources
				.map((s) => relative(monorepo.root, s) || AGENTUITY_IGNORE_FILENAME)
				.join(', ')}`
		);
		logger.trace?.(
			`Deploy ignore patterns (${matcher.userPatterns.length}): ${matcher.userPatterns.join(', ')}`
		);
	} else {
		logger.trace?.('Deploy ignore: no .agentuityignore files found');
	}

	let skippedUser = 0;
	let skippedBuiltIn = 0;
	let protectedKept = 0;
	const protectedWarnOnce = new Set<string>();

	function walk(src: string, dst: string): void {
		mkdirSync(dst, { recursive: true });
		for (const entry of readdirSync(src, { withFileTypes: true })) {
			const srcChild = join(src, entry.name);
			const dstChild = join(dst, entry.name);
			const relPosix = toPosixPath(relative(monorepo.root, srcChild));

			if (relPosix === outRelPosix) continue;

			// Resolve symlink targets so directory patterns (docs/) match.
			let isDirectoryEntry = entry.isDirectory();
			if (entry.isSymbolicLink()) {
				try {
					isDirectoryEntry = statSync(srcChild).isDirectory();
				} catch {
					isDirectoryEntry = false;
				}
			}

			const reason = matcher.classify(relPosix, isDirectoryEntry);
			if (reason) {
				// Built-in safety (node_modules, .env, …) always wins.
				// User patterns cannot strip the target package build output
				// or root lockfile — e.g. bare `dist/` matching apps/web/dist.
				if (reason === 'agentuityignore' && isProtectedStagingPath(relPosix, protect)) {
					protectedKept++;
					if (!protectedWarnOnce.has(relPosix)) {
						protectedWarnOnce.add(relPosix);
						logger.warn?.(
							`Deploy ignore: keeping protected path ${relPosix} (required for monorepo deploy; matched .agentuityignore)`
						);
					}
					logger.trace?.(
						`Deploy ignore: keeping protected ${isDirectoryEntry ? 'directory' : 'file'} ${relPosix}`
					);
					// fall through to copy
				} else {
					const kind = isDirectoryEntry ? 'directory' : 'file';
					if (reason === 'agentuityignore') {
						skippedUser++;
						logger.trace?.(`Deploy ignore: skipping ${kind} ${relPosix} (.agentuityignore)`);
					} else {
						skippedBuiltIn++;
						logger.trace?.(`Deploy ignore: skipping ${kind} ${relPosix} (built-in)`);
					}
					continue;
				}
			}

			if (entry.isDirectory() || (entry.isSymbolicLink() && isDirectoryEntry)) {
				// Regular dirs and symlink-to-dir: recurse so ignore applies nested.
				walk(srcChild, dstChild);
			} else if (entry.isSymbolicLink()) {
				cpSync(srcChild, dstChild, { dereference: true, recursive: true });
			} else {
				cpSync(srcChild, dstChild);
			}
		}
	}

	logger.debug(`Mirroring monorepo from ${monorepo.root} to ${absOut}`);
	walk(monorepo.root, absOut);
	logger.debug(
		`Deploy ignore summary: excluded ${skippedUser} path(s) via .agentuityignore, ${skippedBuiltIn} via built-in, kept ${protectedKept} protected (dirs count as 1)`
	);

	return {
		skippedUser,
		skippedBuiltIn,
		protectedKept,
		userPatternCount: matcher.userPatterns.length,
		ignoreSources: matcher.sources,
	};
}

/** Human-readable build-log lines for a monorepo staging result. */
export function formatMonorepoStageLogs(
	rootLabel: string,
	stats: CopyMonorepoTreeResult
): string[] {
	const lines: string[] = [];
	if (stats.userPatternCount > 0) {
		lines.push(
			`✓ Copied monorepo (root: ${rootLabel}, ${stats.userPatternCount} ignore pattern(s))`
		);
		const builtIn = stats.skippedBuiltIn > 0 ? `, ${stats.skippedBuiltIn} built-in` : '';
		lines.push(
			`✓ Excluded ${stats.skippedUser} path(s) via .agentuityignore${builtIn} (dirs count as 1; contents never enter staging/zip)`
		);
		if (stats.protectedKept > 0) {
			lines.push(
				`⚠ Kept ${stats.protectedKept} protected path(s) that matched .agentuityignore (target package / build output / root manifests)`
			);
		}
	} else {
		lines.push(`✓ Copied monorepo (root: ${rootLabel})`);
		if (stats.skippedBuiltIn > 0) {
			lines.push(
				`✓ Excluded ${stats.skippedBuiltIn} path(s) via built-in rules (dirs count as 1)`
			);
		}
	}
	return lines;
}
