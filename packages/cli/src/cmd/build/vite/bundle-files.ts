import { join, dirname } from 'node:path';
import { mkdirSync, cpSync } from 'node:fs';
import type { Logger } from '../../../types';

/** Paths that are always excluded regardless of .gitignore */
function isHardExcluded(match: string): boolean {
	return (
		match.startsWith('.agentuity/') ||
		match.startsWith('.agentuity\\') ||
		match.startsWith('node_modules/') ||
		match.startsWith('node_modules\\') ||
		match.startsWith('.git/') ||
		match.startsWith('.git\\') ||
		match === '.env' ||
		match.startsWith('.env.')
	);
}

/**
 * Use `git check-ignore --stdin` to filter out files that are ignored by .gitignore.
 * Returns the subset of `files` that are NOT gitignored.
 * Falls back to returning all files if not in a git repo or git is unavailable.
 */
async function filterGitIgnored(
	rootDir: string,
	files: string[],
	logger: Logger
): Promise<string[]> {
	if (files.length === 0) return files;

	try {
		// Check if we're in a git repo
		const gitCheck = Bun.spawnSync(['git', 'rev-parse', '--git-dir'], {
			cwd: rootDir,
			stderr: 'pipe',
		});
		if (gitCheck.exitCode !== 0) {
			logger.debug('Not a git repository, skipping .gitignore filtering');
			return files;
		}

		// Use git check-ignore to find which files are ignored
		const proc = Bun.spawn(['git', 'check-ignore', '--stdin'], {
			cwd: rootDir,
			stdin: 'pipe',
			stdout: 'pipe',
			stderr: 'pipe',
		});

		// Write all file paths to stdin, one per line
		proc.stdin.write(files.join('\n'));
		proc.stdin.end();

		const output = await new Response(proc.stdout).text();
		await proc.exited;

		// git check-ignore exits 0 if some files are ignored, 1 if none are ignored.
		// Both are fine. Other exit codes mean an error.

		const ignoredFiles = output
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean);
		const ignoredSet = new Set(ignoredFiles);

		if (ignoredSet.size > 0) {
			logger.debug(`Filtered ${ignoredSet.size} gitignored file(s) from bundle`);
		}

		return files.filter((f) => !ignoredSet.has(f));
	} catch {
		logger.debug('git not available, skipping .gitignore filtering');
		return files;
	}
}

/**
 * Copy files matching glob patterns into the build output directory.
 * Files are copied preserving their relative directory structure from the project root.
 * This runs BEFORE the build steps so that build output can overwrite any conflicts.
 *
 * Filtering layers:
 * 1. Hard exclusions: .agentuity/, node_modules/, .git/, .env* (always skipped)
 * 2. .gitignore: files ignored by git are skipped (falls back if not a git repo)
 */
export async function copyBundleFiles(
	rootDir: string,
	outDir: string,
	patterns: string[],
	logger: Logger
): Promise<number> {
	let totalCopied = 0;

	// Ensure output directory exists
	mkdirSync(outDir, { recursive: true });

	for (const pattern of patterns) {
		const glob = new Bun.Glob(pattern);
		const candidates: string[] = [];

		// Phase 1: Glob match + hard exclusions
		for await (const match of glob.scan({ cwd: rootDir, onlyFiles: true })) {
			if (!isHardExcluded(match)) {
				candidates.push(match);
			}
		}

		// Phase 2: Filter out gitignored files
		const filesToCopy = await filterGitIgnored(rootDir, candidates, logger);

		// Phase 3: Copy files
		for (const match of filesToCopy) {
			const src = join(rootDir, match);
			const dest = join(outDir, match);
			try {
				mkdirSync(dirname(dest), { recursive: true });
				cpSync(src, dest);
			} catch (err) {
				throw new Error(
					`Failed to copy bundle file '${match}' (pattern '${pattern}'): ${(err as Error).message}`
				);
			}
		}

		if (filesToCopy.length === 0) {
			logger.warn(`Bundle pattern '${pattern}' matched no files`);
		} else {
			logger.debug(`Bundle pattern '${pattern}': ${filesToCopy.length} file(s)`);
		}

		totalCopied += filesToCopy.length;
	}

	return totalCopied;
}
