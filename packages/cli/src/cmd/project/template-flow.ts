import { basename, resolve } from 'node:path';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { cwd } from 'node:process';
import { homedir } from 'node:os';
import enquirer from 'enquirer';
import type { Logger } from '../../logger';
import * as tui from '../../tui';
import { playSound } from '../../sound';
import { fetchTemplates, type TemplateInfo } from './templates';
import { downloadTemplate, setupProject } from './download';

interface CreateFlowOptions {
	projectName?: string;
	dir?: string;
	template?: string;
	templateDir?: string;
	templateBranch?: string;
	noInstall: boolean;
	noBuild: boolean;
	skipPrompts: boolean;
	logger: Logger;
}

export async function runCreateFlow(options: CreateFlowOptions): Promise<void> {
	const {
		projectName: initialProjectName,
		dir: targetDir,
		template: initialTemplate,
		templateDir,
		templateBranch,
		skipPrompts,
		logger,
	} = options;

	// Step 1: Fetch available templates
	if (templateDir) {
		tui.info(`📋 Loading templates from local directory: ${templateDir}...\n`);
	} else if (templateBranch) {
		tui.info(`📋 Fetching available templates from branch: ${templateBranch}...\n`);
	} else {
		tui.info('📋 Fetching available templates...\n');
	}
	const templates = await fetchTemplates(templateDir, templateBranch);

	if (templates.length === 0) {
		logger.fatal('No templates available');
	}

	// Step 2: Get project name
	let projectName = initialProjectName;
	if (!projectName && !skipPrompts) {
		const response = await enquirer.prompt<{ name: string }>({
			type: 'input',
			name: 'name',
			message: 'What is the name of your project?',
			initial: 'My First Agent',
			validate: (value: string) => {
				if (!value || value.trim().length === 0) {
					return 'Project name is required';
				}
				return true;
			},
		});
		projectName = response.name;
	}
	projectName = projectName || 'My First Agent';

	// Step 3: Generate disk-friendly directory name
	const dirName = projectName === '.' ? '.' : sanitizeDirectoryName(projectName);

	// Step 4: Determine destination directory
	// Expand ~ to home directory
	let expandedTargetDir = targetDir;
	if (expandedTargetDir && expandedTargetDir.startsWith('~')) {
		expandedTargetDir = expandedTargetDir.replace(/^~/, homedir());
	}
	const baseDir = expandedTargetDir ? resolve(expandedTargetDir) : process.cwd();
	const dest = dirName === '.' ? baseDir : resolve(baseDir, dirName);
	const destExists = existsSync(dest);
	const destEmpty = destExists ? readdirSync(dest).length === 0 : true;

	if (destExists && !destEmpty && dirName !== '.') {
		// In TTY mode, ask if they want to overwrite
		if (process.stdin.isTTY && !skipPrompts) {
			tui.warning(`Directory ${dest} already exists and is not empty.`, true);
			const response = await enquirer.prompt<{ overwrite: boolean }>({
				type: 'confirm',
				name: 'overwrite',
				message: 'Delete and overwrite the directory?',
				initial: false,
			});

			if (!response.overwrite) {
				tui.info('Operation cancelled');
				process.exit(0);
			}

			// Extra safety: refuse to delete root or home directories
			const home = homedir();
			if (dest === '/' || dest === home) {
				logger.fatal(`Refusing to delete protected path: ${dest}`);
				return;
			}
			rmSync(dest, { recursive: true, force: true });
			tui.success(`Deleted ${dest}\n`);
		} else {
			logger.fatal(`Directory ${dest} already exists and is not empty.`, true);
		}
	}

	// Show directory and name confirmation
	if (!skipPrompts) {
		tui.info(`📁 Project: ${tui.bold(projectName)}`);
		tui.info(`📂 Directory: ${tui.bold(dest)}\n`);
	}

	// Step 5: Select template
	let selectedTemplate: TemplateInfo;
	if (initialTemplate) {
		const found = templates.find((t) => t.id === initialTemplate);
		if (!found) {
			logger.fatal(`Template "${initialTemplate}" not found`);
			return;
		}
		selectedTemplate = found;
	} else if (skipPrompts) {
		selectedTemplate = templates[0];
	} else {
		const response = await enquirer.prompt<{ template: string }>({
			type: 'select',
			name: 'template',
			message: 'Select a template:',
			choices: templates.map((t) => ({
				name: t.id,
				message: `${t.name.padEnd(15, ' ')} ${tui.muted(t.description)}`,
			})),
		});
		const found = templates.find((t) => t.id === response.template);
		if (!found) {
			logger.fatal('Template selection failed');
			return;
		}
		selectedTemplate = found;
	}

	tui.info(`✨ Using template: ${tui.bold(selectedTemplate.name)}`);

	// Step 6: Download template
	await downloadTemplate({
		dest,
		template: selectedTemplate,
		templateDir,
		templateBranch,
		logger,
	});

	// Step 7: Setup project (replace placeholders, install deps, build)
	await setupProject({
		dest,
		projectName: projectName === '.' ? basename(dest) : projectName,
		dirName: dirName === '.' ? basename(dest) : dirName,
		noInstall: options.noInstall,
		noBuild: options.noBuild,
		logger,
	});

	// Step 8: Show completion message
	tui.success('✨ Project created successfully!\n');
	tui.info('Next steps:');
	if (dirName !== '.') {
		const dirDisplay = cwd() == targetDir ? basename(dirName) : dest;
		tui.newline();
		console.log(`  1. ${tui.bold(`cd ${dirDisplay}`)}`);
		console.log(`  2. ${tui.bold('bun run dev')}`);
	} else {
		console.log(`  ${tui.bold('bun run dev')}`);
	}
	playSound();
}

/**
 * Sanitize a project name to create a safe directory/package name
 * - Converts to lowercase
 * - Replaces spaces and underscores with hyphens
 * - Removes unsafe characters
 * - Ensures it starts with a letter or number
 */
function sanitizeDirectoryName(name: string): string {
	return name
		.toLowerCase()
		.trim()
		.replace(/\s+/g, '-') // Replace spaces with hyphens
		.replace(/_+/g, '-') // Replace underscores with hyphens
		.replace(/[^a-z0-9-]/g, '') // Remove non-alphanumeric except hyphens
		.replace(/-+/g, '-') // Collapse multiple hyphens
		.replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
		.replace(/^[^a-z0-9]+/, ''); // Remove leading non-alphanumeric
}
