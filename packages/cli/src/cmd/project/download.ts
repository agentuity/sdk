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
import { generateLLMPrompt as generateCLIPrompt } from '../ai/prompt/llm';
import { generateLLMPrompt as generateAgentPrompt } from '../ai/prompt/agent';
import { generateLLMPrompt as generateWebPrompt } from '../ai/prompt/web';
import { generateLLMPrompt as generateAPIPrompt } from '../ai/prompt/api';
import type { TemplateInfo } from './templates';

const GITHUB_BRANCH = 'main';

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

async function cleanup(sourceDir: string, dest: string) {
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
		const sourceDir = resolve(join(templateDir, template.directory));

		if (!existsSync(sourceDir)) {
			throw new TemplateDirectoryNotFoundError({
				directory: sourceDir,
				message: `Template directory not found: ${sourceDir}`,
			});
		}

		return cleanup(sourceDir, dest);
	}

	// Download from GitHub
	const branch = templateBranch || GITHUB_BRANCH;
	const templatePath = `templates/${template.directory}`;
	const url = `https://agentuity.sh/template/sdk/${branch}/tar.gz`;
	const tempDir = mkdtempSync(join(tmpdir(), 'agentuity-'));
	const tarballPath = join(tempDir, 'download.tar.gz');

	logger.debug('[download] URL: %s', url);
	logger.debug('[download] Branch: %s', branch);
	logger.debug('[download] Template path: %s', templatePath);
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

		// Step 2: Extract tarball
		// We extract only the files within the template directory
		// The tarball structure is: sdk-{branch}/templates/{template.directory}/...
		const extractDir = join(tempDir, 'extract');
		mkdirSync(extractDir, { recursive: true });

		const prefix = `sdk-${branch}/${templatePath}/`;
		logger.debug('[extract] Extract dir: %s', extractDir);
		logger.debug('[extract] Filter prefix: %s', prefix);

		// Track extraction stats for debugging
		let ignoredCount = 0;
		let extractedCount = 0;

		// Track which entries we've mapped so we don't ignore them later
		// Note: tar-fs calls map BEFORE ignore (despite what docs say)
		const mappedEntries = new Set<string>();

		const extractor = extract(extractDir, {
			// map callback: called FIRST, allows modifying the entry before extraction
			// We strip the prefix so files are extracted to the root of extractDir
			map: (header: Headers) => {
				const originalName = header.name;
				if (header.name.startsWith(prefix) && header.name.length > prefix.length) {
					// This is a file/dir we want to extract - strip the prefix
					header.name = header.name.substring(prefix.length);
					mappedEntries.add(header.name); // Track that we mapped this
					logger.debug('[extract] MAP: %s -> %s', originalName, header.name);
					logger.debug('[extract] EXTRACT: %s', originalName);
					extractedCount++;
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
		logger.debug('[extract] Extracted entries: %d', extractedCount);

		// Step 3: Copy extracted files to destination
		await cleanup(extractDir, dest);
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

	// Initialize git repository if git is available
	const gitPath = Bun.which('git');
	if (gitPath) {
		// Git is available, initialize repository
		await tui.runCommand({
			command: 'git init',
			cwd: dest,
			cmd: ['git', 'init'],
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

	// generate and write the AGENTS.md for the cli
	const cliDir = join(dest, 'node_modules', '@agentuity', 'cli');
	if (existsSync(cliDir)) {
		const agentFile = join(cliDir, 'AGENTS.md');
		const prompt = generateCLIPrompt();
		await Bun.write(agentFile, prompt);
	}

	// generate and write AGENTS.md for each of the main folders
	const agentsDir = join(dest, 'src', 'agents');
	if (existsSync(agentsDir)) {
		const agentsAPIFile = join(agentsDir, 'AGENTS.md');
		await Bun.write(agentsAPIFile, generateAgentPrompt());
	}

	const apisDir = join(dest, 'src', 'apis');
	if (existsSync(apisDir)) {
		const agentsAPIsFile = join(apisDir, 'AGENTS.md');
		await Bun.write(agentsAPIsFile, generateAPIPrompt());
	}

	const webDir = join(dest, 'src', 'web');
	if (existsSync(webDir)) {
		const agentsWebFile = join(webDir, 'AGENTS.md');
		await Bun.write(agentsWebFile, generateWebPrompt());
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
