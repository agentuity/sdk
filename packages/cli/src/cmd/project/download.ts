import { join, resolve } from 'node:path';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	renameSync,
	readdirSync,
	cpSync,
	rmSync,
	createReadStream,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { finished } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { extract, type Headers } from 'tar-fs';
import { StructuredError, type Logger } from '@agentuity/core';
import * as tui from '../../tui';
import { downloadWithSpinner } from '../../download';
import { writeAgentsDocs } from '../../agents-docs';
import type { TemplateInfo } from './templates';

const GITHUB_BRANCH = 'main';
const BASE_TEMPLATE_DIR = '_base';

interface DownloadOptions {
	dest: string;
	template: TemplateInfo;
	templateDir?: string;
	templateBranch?: string;
	logger: Logger;
}

interface SetupOptions {
	dest: string;
	projectName: string;
	dirName: string;
	noInstall: boolean;
	noBuild: boolean;
	logger: Logger;
}

const TemplateDirectoryNotFoundError = StructuredError('TemplateDirectoryNotFoundError')<{
	directory: string;
}>();

async function copyTemplateFiles(sourceDir: string, dest: string, skipGitignoreRename = false) {
	if (!existsSync(sourceDir)) {
		return; // Source directory doesn't exist, skip (overlay may be empty)
	}

	// Copy all files from source to dest (overlay wins on conflicts)
	const files = readdirSync(sourceDir);
	for (const file of files) {
		// Skip package.overlay.json - it's handled separately for merging
		if (file === 'package.overlay.json') {
			continue;
		}
		// Skip .gitkeep files - they're just placeholders for empty directories
		if (file === '.gitkeep') {
			continue;
		}
		cpSync(join(sourceDir, file), join(dest, file), { recursive: true });
	}

	// Rename gitignore -> .gitignore (only do this once, after all copies)
	if (!skipGitignoreRename) {
		const gi = join(dest, 'gitignore');
		if (existsSync(gi)) {
			renameSync(gi, join(dest, '.gitignore'));
		}
	}
}

async function mergePackageJson(dest: string, overlayDir: string) {
	const basePackagePath = join(dest, 'package.json');
	const overlayPackagePath = join(overlayDir, 'package.overlay.json');

	// If no overlay package.json exists, nothing to merge
	if (!existsSync(overlayPackagePath)) {
		return;
	}

	// Read base package.json
	const basePackage = JSON.parse(await Bun.file(basePackagePath).text());

	// Read overlay package.json
	const overlayPackage = JSON.parse(await Bun.file(overlayPackagePath).text());

	// Merge dependencies (overlay wins on conflicts)
	if (overlayPackage.dependencies) {
		basePackage.dependencies = {
			...basePackage.dependencies,
			...overlayPackage.dependencies,
		};
	}

	// Merge devDependencies (overlay wins on conflicts)
	if (overlayPackage.devDependencies) {
		basePackage.devDependencies = {
			...basePackage.devDependencies,
			...overlayPackage.devDependencies,
		};
	}

	// Merge scripts (overlay wins on conflicts)
	if (overlayPackage.scripts) {
		basePackage.scripts = {
			...basePackage.scripts,
			...overlayPackage.scripts,
		};
	}

	// Write merged package.json
	await Bun.write(basePackagePath, JSON.stringify(basePackage, null, '\t') + '\n');
}

async function _cleanup(sourceDir: string, dest: string) {
	if (!existsSync(sourceDir)) {
		throw new TemplateDirectoryNotFoundError({
			directory: sourceDir,
			message: `Template directory not found: ${sourceDir}`,
		});
	}

	await tui.spinner(`📦 Copying template files...`, async () => {
		// Copy all files from source to dest
		const files = readdirSync(sourceDir);
		for (const file of files) {
			cpSync(join(sourceDir, file), join(dest, file), { recursive: true });
		}

		// Rename gitignore -> .gitignore
		const gi = join(dest, 'gitignore');
		if (existsSync(gi)) {
			renameSync(gi, join(dest, '.gitignore'));
		}
	});
}

export async function downloadTemplate(options: DownloadOptions): Promise<void> {
	const { dest, template, templateDir, templateBranch, logger } = options;

	mkdirSync(dest, { recursive: true });

	// Copy from local directory if provided
	if (templateDir) {
		const baseDir = resolve(join(templateDir, BASE_TEMPLATE_DIR));
		const overlayDir = resolve(join(templateDir, template.directory));

		// Base template must exist
		if (!existsSync(baseDir)) {
			throw new TemplateDirectoryNotFoundError({
				directory: baseDir,
				message: `Base template directory not found: ${baseDir}`,
			});
		}

		// Overlay directory must exist (even if empty)
		if (!existsSync(overlayDir)) {
			throw new TemplateDirectoryNotFoundError({
				directory: overlayDir,
				message: `Template directory not found: ${overlayDir}`,
			});
		}

		await tui.spinner({
			type: 'progress',
			message: '📦 Copying template files...',
			clearOnSuccess: true,
			callback: async (progress) => {
				// Step 1: Copy base template files (skip gitignore rename for now)
				await copyTemplateFiles(baseDir, dest, true);
				progress(33);

				// Step 2: Copy overlay template files (overlay wins on conflicts)
				await copyTemplateFiles(overlayDir, dest, false);
				progress(66);

				// Step 3: Merge package.json with overlay dependencies
				await mergePackageJson(dest, overlayDir);
				progress(100);
			},
		});

		return;
	}

	// Download from GitHub
	const branch = templateBranch || GITHUB_BRANCH;
	const basePath = `templates/${BASE_TEMPLATE_DIR}`;
	const overlayPath = `templates/${template.directory}`;
	const url = `https://agentuity.sh/template/sdk/${branch}/tar.gz`;
	const tempDir = mkdtempSync(join(tmpdir(), 'agentuity-'));
	const tarballPath = join(tempDir, 'download.tar.gz');

	logger.debug('[download] URL: %s', url);
	logger.debug('[download] Branch: %s', branch);
	logger.debug('[download] Base path: %s', basePath);
	logger.debug('[download] Overlay path: %s', overlayPath);
	logger.debug('[download] Temp dir: %s', tempDir);

	try {
		// Step 1: Download tarball to temp file
		// We download to a file first rather than piping directly to tar-fs
		// because this avoids Bun/Node stream compatibility issues
		await downloadWithSpinner(
			{
				url,
				message: templateBranch
					? `Downloading template files from branch ${branch}...`
					: 'Downloading template files...',
			},
			async (stream) => {
				// Collect all chunks from the download stream
				const chunks: Buffer[] = [];
				for await (const chunk of stream) {
					chunks.push(Buffer.from(chunk));
				}
				const buffer = Buffer.concat(chunks);
				await Bun.write(tarballPath, buffer);

				logger.debug('[download] Downloaded bytes: %dbytes', buffer.length);
				logger.debug('[download] Tarball path: %s', tarballPath);
			}
		);

		// Step 2: Extract tarball - extract both base and overlay templates
		// The tarball structure is: sdk-{branch}/templates/{template.directory}/...
		const baseExtractDir = join(tempDir, 'base');
		const overlayExtractDir = join(tempDir, 'overlay');
		mkdirSync(baseExtractDir, { recursive: true });
		mkdirSync(overlayExtractDir, { recursive: true });

		const basePrefix = `sdk-${branch}/${basePath}/`;
		const overlayPrefix = `sdk-${branch}/${overlayPath}/`;
		logger.debug('[extract] Base extract dir: %s', baseExtractDir);
		logger.debug('[extract] Overlay extract dir: %s', overlayExtractDir);
		logger.debug('[extract] Base prefix: %s', basePrefix);
		logger.debug('[extract] Overlay prefix: %s', overlayPrefix);

		// Track extraction stats for debugging
		let ignoredCount = 0;
		let baseExtractedCount = 0;
		let overlayExtractedCount = 0;

		// Track which entries we've mapped so we don't ignore them later
		// Note: tar-fs calls map BEFORE ignore (despite what docs say)
		const mappedEntries = new Set<string>();

		const extractor = extract(tempDir, {
			// map callback: called FIRST, allows modifying the entry before extraction
			// We extract base files to baseExtractDir and overlay files to overlayExtractDir
			map: (header: Headers) => {
				const originalName = header.name;

				// Check if this is a base template file
				if (header.name.startsWith(basePrefix) && header.name.length > basePrefix.length) {
					header.name = `base/${header.name.substring(basePrefix.length)}`;
					mappedEntries.add(header.name);
					logger.debug('[extract] MAP BASE: %s -> %s', originalName, header.name);
					baseExtractedCount++;
				}
				// Check if this is an overlay template file
				else if (
					header.name.startsWith(overlayPrefix) &&
					header.name.length > overlayPrefix.length
				) {
					header.name = `overlay/${header.name.substring(overlayPrefix.length)}`;
					mappedEntries.add(header.name);
					logger.debug('[extract] MAP OVERLAY: %s -> %s', originalName, header.name);
					overlayExtractedCount++;
				}

				return header;
			},
			// ignore callback: called AFTER map, receives the MAPPED name
			// Return true to skip the entry, false to extract it
			ignore: (name: string, header?: Headers) => {
				if (!header) {
					ignoredCount++;
					return true;
				}

				// If we already mapped this entry, don't ignore it
				if (mappedEntries.has(header.name)) {
					return false;
				}

				// Otherwise, ignore it
				logger.debug('[extract] IGNORE: %s', header.name);
				ignoredCount++;
				return true;
			},
		});

		// Pipe: tarball file -> gunzip -> tar extractor
		createReadStream(tarballPath).pipe(createGunzip()).pipe(extractor);
		await finished(extractor);

		logger.debug('[extract] Extraction complete');
		logger.debug('[extract] Ignored entries: %d', ignoredCount);
		logger.debug('[extract] Base extracted entries: %d', baseExtractedCount);
		logger.debug('[extract] Overlay extracted entries: %d', overlayExtractedCount);

		// Step 3: Copy base template files, then overlay template files
		await tui.spinner({
			type: 'progress',
			message: '📦 Copying template files...',
			clearOnSuccess: true,
			callback: async (progress) => {
				// Copy base template files (skip gitignore rename for now)
				await copyTemplateFiles(baseExtractDir, dest, true);
				progress(33);

				// Copy overlay template files (overlay wins on conflicts)
				await copyTemplateFiles(overlayExtractDir, dest, false);
				progress(66);

				// Merge package.json with overlay dependencies
				await mergePackageJson(dest, overlayExtractDir);
				progress(100);
			},
		});
	} finally {
		// Clean up temp directory
		logger.debug('[cleanup] Removing temp dir: %s', tempDir);
		rmSync(tempDir, { recursive: true, force: true });
	}
}

export async function setupProject(options: SetupOptions): Promise<void> {
	const { dest, projectName, dirName, noInstall, noBuild, logger } = options;

	// Replace {{PROJECT_NAME}} in files
	tui.info(`🔧 Setting up ${projectName}...`);
	await replaceInFiles(dest, projectName, dirName);

	// Install dependencies
	if (!noInstall) {
		const exitCode = await tui.runCommand({
			command: 'bun install',
			cwd: dest,
			cmd: ['bun', 'install'],
			clearOnSuccess: true,
		});
		if (exitCode !== 0) {
			logger.error('Failed to install dependencies');
		}
	}

	// Run optional template setup script if it exists
	// This allows templates to run custom setup logic after bun install
	const setupScriptPath = join(dest, '_setup.ts');
	if (existsSync(setupScriptPath)) {
		try {
			const exitCode = await tui.runCommand({
				command: 'bun _setup.ts',
				cwd: dest,
				cmd: ['bun', '_setup.ts'],
				clearOnSuccess: true,
			});
			if (exitCode !== 0) {
				logger.error('Template setup script failed');
			}
		} finally {
			// Always delete the setup script after running (or attempting to run)
			try {
				rmSync(setupScriptPath);
			} catch {
				// Ignore errors when deleting the setup script
			}
		}
	}

	// Build project
	if (!noBuild) {
		const exitCode = await tui.runCommand({
			command: 'bun run build --dev',
			cwd: dest,
			cmd: ['bun', 'run', 'build', '--dev'],
			clearOnSuccess: true,
		});
		if (exitCode !== 0) {
			logger.error('Failed to build project');
		}
	}

	// Generate and write AGENTS.md files for the CLI and source folders
	// Always overwrite during project setup to ensure fresh content
	await writeAgentsDocs(dest);
}

export async function initGitRepo(dest: string): Promise<void> {
	// Initialize git repository if git is available
	// Check for real git (not macOS stub that triggers Xcode CLT popup)
	const { isGitAvailable, getDefaultBranch } = await import('../../git-helper');
	const gitAvailable = await isGitAvailable();

	if (gitAvailable) {
		// Get default branch from git config, fallback to 'main'
		const defaultBranch = (await getDefaultBranch()) || 'main';

		// Git is available, initialize repository
		await tui.runCommand({
			command: `git init -b ${defaultBranch}`,
			cwd: dest,
			cmd: ['git', 'init', '-b', defaultBranch],
			clearOnSuccess: true,
		});

		// Configure git user in CI environments (where git config may not be set)
		if (process.env.CI) {
			await tui.runCommand({
				command: 'git config user.email',
				cwd: dest,
				cmd: ['git', 'config', 'user.email', 'agentuity@example.com'],
				clearOnSuccess: true,
			});

			await tui.runCommand({
				command: 'git config user.name',
				cwd: dest,
				cmd: ['git', 'config', 'user.name', 'Agentuity'],
				clearOnSuccess: true,
			});
		}

		// Add all files
		await tui.runCommand({
			command: 'git add .',
			cwd: dest,
			cmd: ['git', 'add', '.'],
			clearOnSuccess: true,
		});

		// Create initial commit (disable GPG signing to avoid lock issues)
		await tui.runCommand({
			command: 'git commit -m "Initial Setup"',
			cwd: dest,
			cmd: ['git', '-c', 'commit.gpgsign=false', 'commit', '-m', 'Initial Setup'],
			clearOnSuccess: true,
		});
	}
}

async function replaceInFiles(dir: string, projectName: string, dirName: string): Promise<void> {
	const filesToReplace = ['package.json', 'README.md', 'AGENTS.md'];

	for (const file of filesToReplace) {
		const filePath = join(dir, file);
		const bunFile = Bun.file(filePath);
		if (await bunFile.exists()) {
			let content = await bunFile.text();
			// Replace human-readable name in most places
			content = content.replace(/\{\{PROJECT_NAME\}\}/g, projectName);
			// Replace with directory name for package.json "name" field (npm package name)
			if (file === 'package.json') {
				content = content.replace(/"name":\s*".*?"/, `"name": "${dirName}"`);
			}
			await Bun.write(filePath, content);
		}
	}
}
