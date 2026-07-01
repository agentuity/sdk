/**
 * Framework scaffolding and augmentation.
 *
 * Replaces the old template download system. Instead of maintaining
 * custom templates, we run the framework's official create CLI and
 * then augment the result with Agentuity integration.
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from '@agentuity/core';
import * as tui from '../../tui.ts';
import { getVersion } from '../../version.ts';
import { wireSkillsToProject } from '../../skills/index.ts';
import type { PackageManager } from '../build/detect/types.ts';
import type { FrameworkScaffold } from './frameworks.ts';
import { applyOverlay } from './frameworks.ts';
import { getService } from './services-catalog.ts';

interface ScaffoldOptions {
	/** Absolute path to the target directory */
	dest: string;
	/** The directory name (for display) */
	dirName: string;
	/** Selected framework */
	framework: FrameworkScaffold;
	/** Whether to include AI example */
	includeAiExample: boolean;
	/** Package manager to drive the framework's create command. */
	packageManager: PackageManager;
	/** Whether to include Agentuity skills wiring. */
	includeSkills: boolean;
	/** Logger */
	logger: Logger;
}

interface SetupOptions {
	/** Absolute path to the project directory */
	dest: string;
	/** Human-readable project name */
	projectName: string;
	/** Whether to skip the post-scaffold install step. */
	noInstall: boolean;
	/** Package manager to use when re-running install after augments. */
	packageManager: PackageManager;
	/** Logger */
	logger: Logger;
}

/**
 * Run the framework's official create CLI to scaffold the project.
 */
export async function scaffoldFramework(options: ScaffoldOptions): Promise<void> {
	const { dest, dirName, framework, includeAiExample, packageManager, includeSkills, logger } =
		options;

	// Step 1: Run the framework's create command
	const cmd = framework.createCommand(dirName, packageManager);
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
	await augmentProject(dest, framework, includeAiExample, packageManager, includeSkills, logger);
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
	packageManager: PackageManager,
	includeSkills: boolean,
	logger: Logger
): Promise<void> {
	await tui.spinner({
		type: 'progress',
		message: '⚡ Adding Agentuity integration...',
		clearOnSuccess: true,
		callback: async (progress) => {
			// Step 1: Merge package.json
			await mergePackageJson(dest, framework, packageManager);
			progress(25);

			if (includeSkills) {
				await wireSkillsToProject({ projectDir: dest });
			}

			// Step 2: Apply template overlay if configured
			if (framework.overlayDir) {
				if (includeAiExample) {
					applyOverlay(dest, framework.overlayDir);
					removeTemplateManifest(dest);
					logger.debug('Applied template overlay: %s', framework.overlayDir);
				} else {
					// When AI example is not requested, we still want the landing page
					// but without the API route. For now, skip the entire overlay.
					logger.debug('Skipped template overlay (AI example not requested)');
				}
			}
			if (framework.slug === 'hono' && packageManager === 'bun') {
				await addHonoBunTypes(dest);
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
function removeTemplateManifest(dest: string): void {
	const manifestPath = join(dest, 'manifest.json');
	if (existsSync(manifestPath)) {
		rmSync(manifestPath);
	}
}

async function addHonoBunTypes(dest: string): Promise<void> {
	const tsconfigPath = join(dest, 'tsconfig.json');
	if (!existsSync(tsconfigPath)) return;

	const tsconfig = JSON.parse(await readFile(tsconfigPath, 'utf-8'));
	const compilerOptions = tsconfig.compilerOptions ?? {};
	const types = Array.isArray(compilerOptions.types) ? compilerOptions.types : [];
	if (!types.includes('bun')) {
		compilerOptions.types = [...types, 'bun'];
	}
	tsconfig.compilerOptions = compilerOptions;

	await writeFile(tsconfigPath, JSON.stringify(tsconfig, null, '\t') + '\n');
}

async function mergePackageJson(
	dest: string,
	framework: FrameworkScaffold,
	packageManager: PackageManager
): Promise<void> {
	const pkgPath = join(dest, 'package.json');
	const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));

	// Ensure sections exist
	pkg.dependencies = pkg.dependencies ?? {};
	pkg.devDependencies = pkg.devDependencies ?? {};
	pkg.scripts = pkg.scripts ?? {};

	// Pin Agentuity packages to the exact CLI version so generated apps do
	// not mix stable packages with beta/alpha CLI templates.
	const agentuityVersion = getVersion();

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

	if (
		framework.slug === 'hono' &&
		packageManager === 'bun' &&
		!pkg.devDependencies['@types/bun']
	) {
		pkg.devDependencies['@types/bun'] = '^1.3.14';
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
	const { dest, projectName, noInstall, packageManager, logger } = options;
	let hasError = false;

	tui.info(`🔧 Setting up ${projectName}...`);

	// Install dependencies (the framework CLI may have already done this,
	// but we need to install our added deps).
	if (!noInstall) {
		const installCmd: string[] =
			packageManager === 'yarn' ? ['yarn', 'install'] : [packageManager, 'install'];
		const exitCode = await tui.runCommand({
			command: installCmd.join(' '),
			cwd: dest,
			cmd: installCmd,
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

interface CommitAgentuityAugmentationOptions {
	/** Selected service ids included in the Agentuity example augmentation. */
	services: string[];
	/** Git commit author */
	author?: { name: string; email: string };
}

/**
 * Commit Agentuity augmentation changes when the framework scaffold already
 * created a git repository. Many official framework CLIs create an initial
 * commit before our overlays and service examples are applied; without this
 * follow-up commit those generated changes are left in the user's worktree.
 */
export async function commitAgentuityAugmentation(
	dest: string,
	options: CommitAgentuityAugmentationOptions
): Promise<void> {
	const { isGitAvailable, runGit } = await import('../../git-helper.ts');
	if (!(await isGitAvailable())) return;

	const insideWorkTree = await runGit(['rev-parse', '--is-inside-work-tree'], { cwd: dest });
	if (!insideWorkTree.ok || insideWorkTree.stdout !== 'true') return;

	const topLevel = await runGit(['rev-parse', '--show-toplevel'], { cwd: dest });
	if (!topLevel.ok) return;
	if ((await realpath(topLevel.stdout.trim())) !== (await realpath(dest))) return;

	const status = await runGit(['status', '--porcelain', '--', '.'], { cwd: dest });
	if (!status.ok || status.stdout.trim() === '') return;

	const add = await runGit(['add', '.'], { cwd: dest });
	if (!add.ok) return;

	const staged = await runGit(['diff', '--cached', '--quiet', '--', '.'], { cwd: dest });
	if (staged.exitCode !== 1) return;

	const authorName = options.author?.name ?? 'Agentuity';
	const authorEmail = options.author?.email ?? 'bot@agentuity.com';
	const authorStr = `${authorName} <${authorEmail}>`;
	const message = augmentationCommitMessage(options.services);

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
			message,
			'--',
			'.',
		],
		env: {
			GIT_COMMITTER_NAME: authorName,
			GIT_COMMITTER_EMAIL: authorEmail,
		},
		clearOnSuccess: true,
	});
}

function augmentationCommitMessage(services: string[]): string {
	if (services.length === 0) {
		return 'Augmented with Agentuity examples';
	}

	const serviceNames = services.map((service) => getService(service)?.label ?? service);
	return `Augmented with Agentuity examples for services: ${serviceNames.join(', ')}`;
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
