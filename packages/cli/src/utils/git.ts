import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Logger } from '@agentuity/core';
import { runGit } from '../git-helper.ts';
import { which } from '../node-compat/which.ts';

/**
 * Git information detected from the repository
 */
export interface GitInfo {
	branch?: string;
	repo?: string;
	provider?: string;
	tags?: string[];
	commit?: string;
	message?: string;
}

/**
 * Git options that can be provided via CLI flags to override auto-detected values
 */
export interface GitOptions {
	message?: string;
	commit?: string;
	branch?: string;
	repo?: string;
	provider?: string;
	commitUrl?: string;
}

/**
 * Extended git info that includes CI-related fields
 */
export interface GitInfoExtended extends GitInfo {
	commitUrl?: string;
	logsUrl?: string;
	trigger?: string;
	event?: string;
	pull_request?: {
		number: number;
		url?: string;
	};
}

/**
 * Detect git information from the repository at the given root directory.
 * Walks up parent directories to find .git directory (supports monorepos).
 *
 * @param rootDir - The root directory to start searching for .git
 * @param logger - Logger instance for trace output
 * @returns Git information or undefined if not in a git repository
 */
export async function getGitInfo(rootDir: string, logger: Logger): Promise<GitInfo | undefined> {
	if (!(await which('git'))) {
		logger.trace('git not found in PATH');
		return undefined;
	}

	try {
		// Find .git directory (may be in parent directories for monorepos)
		let gitDir = join(rootDir, '.git');
		let parentDir = dirname(dirname(gitDir));
		while (!existsSync(gitDir) && parentDir !== dirname(parentDir) && gitDir !== '/') {
			gitDir = join(parentDir, '.git');
			parentDir = dirname(parentDir);
		}

		if (!existsSync(gitDir)) {
			logger.trace('No .git directory found');
			return undefined;
		}

		const gitInfo: GitInfo = {
			provider: 'git',
		};

		// Get git tags pointing to HEAD
		const tagResult = await runGit(['tag', '-l', '--points-at', 'HEAD'], { cwd: rootDir });
		if (tagResult.stdout) {
			gitInfo.tags = tagResult.stdout
				.split(/\n/)
				.map((s) => s.trim())
				.filter(Boolean);
		}

		// Get current branch
		const branchResult = await runGit(['branch', '--show-current'], { cwd: rootDir });
		if (branchResult.stdout) {
			gitInfo.branch = branchResult.stdout;
		}

		// Get commit SHA
		const commitResult = await runGit(['rev-parse', 'HEAD'], { cwd: rootDir });
		if (commitResult.stdout) {
			gitInfo.commit = commitResult.stdout;

			// Get commit message
			const msgResult = await runGit(['log', '--pretty=format:%s', '-n1', gitInfo.commit], {
				cwd: rootDir,
			});
			if (msgResult.stdout) {
				gitInfo.message = msgResult.stdout;
			}
		}

		// Get remote origin URL and parse
		const originResult = await runGit(['config', '--get', 'remote.origin.url'], { cwd: rootDir });
		if (originResult.stdout) {
			const remoteUrl = originResult.stdout;

			// Parse provider and repo from URL
			if (remoteUrl.includes('github.com')) {
				gitInfo.provider = 'github';
				const match = remoteUrl.match(/github\.com[:/](.+?)(?:\.git)?$/);
				if (match) {
					gitInfo.repo = `https://github.com/${match[1]}`;
				}
			} else if (remoteUrl.includes('gitlab.com')) {
				gitInfo.provider = 'gitlab';
				const match = remoteUrl.match(/gitlab\.com[:/](.+?)(?:\.git)?$/);
				if (match) {
					gitInfo.repo = `https://gitlab.com/${match[1]}`;
				}
			} else if (remoteUrl.includes('bitbucket.org')) {
				gitInfo.provider = 'bitbucket';
				const match = remoteUrl.match(/bitbucket\.org[:/](.+?)(?:\.git)?$/);
				if (match) {
					gitInfo.repo = `https://bitbucket.org/${match[1]}`;
				}
			} else {
				gitInfo.repo = remoteUrl;
			}
		}

		return gitInfo;
	} catch (error) {
		logger.trace(`Failed to get git info: ${error}`);
		return undefined;
	}
}

/**
 * Merge auto-detected git info with CLI-provided overrides.
 * CLI options take precedence over auto-detected values.
 *
 * @param autoDetected - Git info auto-detected from the repository
 * @param overrides - CLI options that override auto-detected values
 * @returns Merged git info
 */
export function mergeGitInfo(
	autoDetected: GitInfo | undefined,
	overrides: GitOptions
): GitInfoExtended {
	const result: GitInfoExtended = { ...(autoDetected ?? {}) };

	// CLI overrides take precedence
	if (overrides.message !== undefined) {
		result.message = overrides.message;
	}
	if (overrides.commit !== undefined) {
		result.commit = overrides.commit;
	}
	if (overrides.branch !== undefined) {
		result.branch = overrides.branch;
	}
	if (overrides.repo !== undefined) {
		result.repo = overrides.repo;
	}
	if (overrides.provider !== undefined) {
		result.provider = overrides.provider;
	}
	if (overrides.commitUrl !== undefined) {
		result.commitUrl = overrides.commitUrl;
	}

	return result;
}

/**
 * Build an array of tags from git info, including branch and short commit.
 * Used for deployment tagging.
 *
 * @param gitInfo - Git information
 * @returns Array of tags
 */
export function buildGitTags(gitInfo: GitInfo | undefined): string[] {
	const tags = new Set(gitInfo?.tags ?? []);
	tags.add('latest');
	if (gitInfo?.branch) {
		tags.add(gitInfo.branch);
	}
	if (gitInfo?.commit) {
		tags.add(gitInfo.commit.substring(0, 7));
	}
	return Array.from(tags);
}
