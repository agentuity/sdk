import { join } from 'node:path';
import { existsSync, mkdirSync, renameSync, readdirSync, cpSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { extract, type Headers } from 'tar-fs';
import type { Logger } from '@/logger';
import * as tui from '@/tui';
import { downloadWithSpinner } from '@/download';
import type { TemplateInfo } from './templates';

const GITHUB_REPO = 'agentuity/sdk';
const GITHUB_BRANCH = 'main';

interface DownloadOptions {
	dest: string;
	template: TemplateInfo;
	templateDir?: string;
	templateBranch?: string;
}

interface SetupOptions {
	dest: string;
	projectName: string;
	dirName: string;
	noInstall: boolean;
	noBuild: boolean;
	logger: Logger;
}

export async function downloadTemplate(options: DownloadOptions): Promise<void> {
	const { dest, template, templateDir, templateBranch } = options;

	mkdirSync(dest, { recursive: true });

	// Copy from local directory if provided
	if (templateDir) {
		const { resolve } = await import('node:path');
		const sourceDir = resolve(join(templateDir, template.directory));

		if (!existsSync(sourceDir)) {
			throw new Error(`Template directory not found: ${sourceDir}`);
		}

		tui.info(`📦 Copying template from ${sourceDir}...`);

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

		return;
	}

	// Download from GitHub
	const branch = templateBranch || GITHUB_BRANCH;
	const templatePath = `templates/${template.directory}`;
	const url = `https://codeload.github.com/${GITHUB_REPO}/tar.gz/${branch}`;
	const tempDir = join(dest, '.temp-download');
	mkdirSync(tempDir, { recursive: true });

	await downloadWithSpinner(
		{
			url,
			message: templateBranch
				? `Downloading template files from branch ${branch}...`
				: 'Downloading template files...',
		},
		async (stream) => {
			// Extract only the template directory from tarball
			const prefix = `sdk-${branch}/${templatePath}/`;
			await pipeline(
				stream,
				createGunzip(),
				extract(tempDir, {
					filter: (name: string) => name.startsWith(prefix),
					map: (header: Headers) => {
						header.name = header.name.substring(prefix.length);
						return header;
					},
				})
			);
		}
	);

	// Move files from temp to dest
	const files = readdirSync(tempDir);
	for (const file of files) {
		cpSync(join(tempDir, file), join(dest, file), { recursive: true });
	}

	// Extra safety: refuse to delete root or home directories
	const home = homedir();
	if (tempDir === '/' || tempDir === home) {
		throw new Error(`Refusing to delete protected path: ${tempDir}`);
	}
	rmSync(tempDir, { recursive: true, force: true });

	// Rename gitignore -> .gitignore
	const gi = join(dest, 'gitignore');
	if (existsSync(gi)) {
		renameSync(gi, join(dest, '.gitignore'));
	}
}

export async function setupProject(options: SetupOptions): Promise<void> {
	const { dest, projectName, dirName, noInstall, noBuild, logger } = options;

	// Replace {{PROJECT_NAME}} in files
	tui.info(`🔧 Setting up ${projectName}...`);
	await replaceInFiles(dest, projectName, dirName);

	// Run setup.ts if it exists (legacy)
	if (await Bun.file('./setup.ts').exists()) {
		await tui.spinner({
			message: 'Running setup script...',
			callback: async () => {
				const proc = Bun.spawn(['bun', './setup.ts'], {
					cwd: dest,
					stdio: ['pipe', 'pipe', 'pipe'],
				});
				const exitCode = await proc.exited;
				if (exitCode !== 0) {
					logger.error('Setup script failed');
				}
			},
		});
	}

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

	// Build project
	if (!noBuild) {
		const exitCode = await tui.runCommand({
			command: 'bun run build',
			cwd: dest,
			cmd: ['bun', 'run', 'build'],
			clearOnSuccess: true,
		});
		if (exitCode !== 0) {
			logger.error('Failed to build project');
		}
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
