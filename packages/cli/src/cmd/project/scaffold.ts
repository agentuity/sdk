/**
 * Framework scaffolding and augmentation.
 *
 * Replaces the old template download system. Instead of maintaining
 * custom templates, we run the framework's official create CLI and
 * then augment the result with Agentuity integration.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from '@agentuity/core';
import * as tui from '../../tui.ts';
import { getVersion } from '../../version.ts';
import type { FrameworkScaffold } from './frameworks.ts';
import { applyOverlay } from './frameworks.ts';

interface ScaffoldOptions {
	/** Absolute path to the target directory */
	dest: string;
	/** The directory name (for display) */
	dirName: string;
	/** Selected framework */
	framework: FrameworkScaffold;
	/** Whether to include AI example */
	includeAiExample: boolean;
	/** Logger */
	logger: Logger;
}

interface SetupOptions {
	/** Absolute path to the project directory */
	dest: string;
	/** Human-readable project name */
	projectName: string;
	/** Whether to skip `bun install` */
	noInstall: boolean;
	/** Logger */
	logger: Logger;
}

/**
 * Run the framework's official create CLI to scaffold the project.
 */
export async function scaffoldFramework(options: ScaffoldOptions): Promise<void> {
	const { dest, dirName, framework, includeAiExample, logger } = options;

	// Step 1: Run the framework's create command
	const cmd = framework.createCommand(dirName);
	logger.debug('Scaffolding with: %s', cmd.join(' '));

	const parentDir = join(dest, '..');
	mkdirSync(parentDir, { recursive: true });

	const exitCode = await tui.runCommand({
		command: `${framework.name} scaffolding`,
		cwd: parentDir,
		cmd,
		clearOnSuccess: true,
	});

	if (exitCode !== 0) {
		throw new Error(`Framework scaffolding failed (exit code ${exitCode})`);
	}

	if (!existsSync(dest)) {
		throw new Error(`Scaffolding did not create expected directory: ${dest}`);
	}

	// Step 2: Augment with Agentuity integration
	await augmentProject(dest, framework, includeAiExample, logger);
}

/**
 * Augment a scaffolded project with Agentuity integration.
 *
 * - Adds @agentuity/cli as devDependency
 * - Merges deploy/build scripts into package.json
 * - Applies template overlay (AI example files + landing page)
 * - Generates AGENTS.md documentation
 */
async function augmentProject(
	dest: string,
	framework: FrameworkScaffold,
	includeAiExample: boolean,
	logger: Logger
): Promise<void> {
	await tui.spinner({
		type: 'progress',
		message: '⚡ Adding Agentuity integration...',
		clearOnSuccess: true,
		callback: async (progress) => {
			// Step 1: Merge package.json
			await mergePackageJson(dest, framework);
			progress(25);

			// Step 2: Apply template overlay if configured
			if (framework.overlayDir) {
				if (includeAiExample) {
					applyOverlay(dest, framework.overlayDir);
					logger.debug('Applied template overlay: %s', framework.overlayDir);
				} else {
					// When AI example is not requested, we still want the landing page
					// but without the API route. For now, skip the entire overlay.
					logger.debug('Skipped template overlay (AI example not requested)');
				}
			}
			progress(75);

			// Step 3: Add .gitignore entries
			await appendGitignore(dest);
			progress(100);
		},
	});
}

/**
 * Merge Agentuity dependencies and scripts into the project's package.json.
 */
async function mergePackageJson(dest: string, framework: FrameworkScaffold): Promise<void> {
	const pkgPath = join(dest, 'package.json');
	const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));

	// Ensure sections exist
	pkg.dependencies = pkg.dependencies ?? {};
	pkg.devDependencies = pkg.devDependencies ?? {};
	pkg.scripts = pkg.scripts ?? {};

	// Derive the version specifier for @agentuity packages from the CLI's own version.
	// If the CLI is a prerelease (e.g. 3.0.0-alpha.2), use the dist-tag (alpha)
	// so that `bun install` can resolve it from the correct npm tag.
	// For stable releases, use the major version range (e.g. ^3.0.0).
	const agentuityVersion = getAgentuityVersionSpecifier(getVersion());

	// Add @agentuity/cli as devDependency
	pkg.devDependencies['@agentuity/cli'] = agentuityVersion;

	// Add framework-specific dependencies
	if (framework.dependencies) {
		for (const dep of framework.dependencies) {
			if (!pkg.dependencies[dep]) {
				pkg.dependencies[dep] = dep.startsWith('@agentuity/') ? agentuityVersion : 'latest';
			}
		}
	}

	// Add framework-specific devDependencies
	if (framework.devDependencies) {
		for (const dep of framework.devDependencies) {
			if (!pkg.devDependencies[dep]) {
				pkg.devDependencies[dep] = dep.startsWith('@agentuity/') ? agentuityVersion : 'latest';
			}
		}
	}

	// Merge scripts (framework-specific scripts win)
	if (framework.scripts) {
		for (const [name, script] of Object.entries(framework.scripts)) {
			pkg.scripts[name] = script;
		}
	}

	await writeFile(pkgPath, JSON.stringify(pkg, null, '\t') + '\n');
}

/**
 * Derive the version specifier for @agentuity packages from the CLI's own version.
 *
 * If the CLI is a prerelease (e.g. 3.0.0-alpha.2), use the dist-tag (alpha)
 * so that `bun install` can resolve it from the correct npm tag.
 * For stable releases, use the major version range (e.g. ^3.0.0).
 */
function getAgentuityVersionSpecifier(cliVersion: string): string {
	const match = cliVersion.match(/-([a-zA-Z]+)/);
	if (match) {
		return match[1]!.toLowerCase();
	}
	const major = cliVersion.split('.')[0] ?? '3';
	return `^${major}.0.0`;
}

/**
 * Append Agentuity-specific entries to .gitignore.
 */
async function appendGitignore(dest: string): Promise<void> {
	const gitignorePath = join(dest, '.gitignore');
	const entries = ['.agentuity/', '.env', '.env.local', 'agentuity.json'];

	let content = '';
	if (existsSync(gitignorePath)) {
		content = await readFile(gitignorePath, 'utf-8');
	}

	const missing = entries.filter((entry) => !content.includes(entry));
	if (missing.length > 0) {
		const section = '\n# Agentuity\n' + missing.join('\n') + '\n';
		await writeFile(gitignorePath, content.trimEnd() + section);
	}
}

/**
 * Set up the project after scaffolding: install deps, generate docs.
 */
export async function setupProject(options: SetupOptions): Promise<{ success: boolean }> {
	const { dest, projectName, noInstall, logger } = options;
	let hasError = false;

	tui.info(`🔧 Setting up ${projectName}...`);

	// Install dependencies (the framework CLI may have already done this,
	// but we need to install our added deps)
	if (!noInstall) {
		const exitCode = await tui.runCommand({
			command: 'bun install',
			cwd: dest,
			cmd: ['bun', 'install'],
			clearOnSuccess: true,
		});
		if (exitCode !== 0) {
			logger.error('Failed to install dependencies');
			hasError = true;
		}
	}

	return { success: !hasError };
}

// ─── Git Initialization ──────────────────────────────────────────────────────

interface InitGitRepoOptions {
	/** Project name (e.g. "My App") */
	projectName?: string;
	/** Where the project came from (e.g. "Next.js") */
	source?: string;
	/** Git commit author */
	author?: { name: string; email: string };
}

/**
 * Initialize a git repository and create the initial commit.
 */
export async function initGitRepo(dest: string, options?: InitGitRepoOptions): Promise<void> {
	// Safety: refuse to init if .git already exists (prevents clobbering existing repos)
	if (existsSync(join(dest, '.git'))) {
		// Framework CLI may have already initialized git — skip
		return;
	}

	const { isGitAvailable, getDefaultBranch } = await import('../../git-helper.ts');
	const gitAvailable = await isGitAvailable();

	if (gitAvailable) {
		const defaultBranch = (await getDefaultBranch()) || 'main';

		await tui.runCommand({
			command: `git init -b ${defaultBranch}`,
			cwd: dest,
			cmd: ['git', 'init', '-b', defaultBranch],
			clearOnSuccess: true,
		});

		// Configure git user in CI/sandbox environments
		if (process.env.CI || process.env.AGENTUITY_SANDBOX_ID) {
			const cfgEmail = options?.author?.email ?? 'bot@agentuity.com';
			const cfgName = options?.author?.name ?? 'Agentuity';

			await tui.runCommand({
				command: 'git config user.email',
				cwd: dest,
				cmd: ['git', 'config', 'user.email', cfgEmail],
				clearOnSuccess: true,
			});

			await tui.runCommand({
				command: 'git config user.name',
				cwd: dest,
				cmd: ['git', 'config', 'user.name', cfgName],
				clearOnSuccess: true,
			});
		}

		await tui.runCommand({
			command: 'git add .',
			cwd: dest,
			cmd: ['git', 'add', '.'],
			clearOnSuccess: true,
		});

		const authorName = options?.author?.name ?? 'Agentuity';
		const authorEmail = options?.author?.email ?? 'bot@agentuity.com';
		const authorStr = `${authorName} <${authorEmail}>`;

		await tui.runCommand({
			command: 'git commit',
			cwd: dest,
			cmd: [
				'git',
				'-c',
				'commit.gpgsign=false',
				'commit',
				`--author=${authorStr}`,
				'-m',
				'Initial Setup',
			],
			env: {
				GIT_COMMITTER_NAME: authorName,
				GIT_COMMITTER_EMAIL: authorEmail,
			},
			clearOnSuccess: true,
		});
	}
}
