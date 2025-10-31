import { basename, resolve } from 'node:path';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { cwd } from 'node:process';
import { homedir } from 'node:os';
import enquirer from 'enquirer';
import {
	projectCreate,
	projectExists,
	listOrganizations,
	type OrganizationList,
} from '@agentuity/server';
import type { Logger } from '../../logger';
import * as tui from '../../tui';
import { playSound } from '../../sound';
import { fetchTemplates, type TemplateInfo } from './templates';
import { downloadTemplate, setupProject } from './download';
import { showBanner } from '../../banner';
import type { AuthData, Config } from '../../types';
import { getAPIBaseURL, APIClient } from '../../api';
import { createProjectConfig } from '../../config';

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
	auth?: AuthData;
	config?: Config;
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
		auth,
		config,
	} = options;

	showBanner();

	// Step 1: Fetch available templates
	if (templateDir) {
		tui.info(`📋 Loading templates from local directory: ${templateDir}...\n`);
	}

	const templates = await tui.spinner('Fetching templates', async () => {
		return fetchTemplates(templateDir, templateBranch);
	});

	if (templates.length === 0) {
		logger.fatal('No templates available');
	}

	// Step 2: Get project name
	let projectName = initialProjectName;

	let orgs: OrganizationList | undefined;
	let client: APIClient | undefined;
	let orgId: string | undefined;

	if (auth) {
		const apiUrl = getAPIBaseURL(config);
		client = new APIClient(apiUrl, config);
		orgs = await tui.spinner('Fetching organizations', async () => {
			const resp = await listOrganizations(client!);
			if (resp.data) {
				return resp.data;
			}
		});
		if (!orgs) {
			tui.fatal('no organizations could be found for your login');
		}
		orgId = await tui.selectOrganization(orgs, config?.preferences?.orgId);
	}

	if (!projectName && !skipPrompts) {
		const response = await enquirer.prompt<{ name: string }>({
			type: 'input',
			name: 'name',
			message: 'What is the name of your project?',
			initial: 'My First Agent',
			validate: async (value: string) => {
				if (!value || value.trim().length === 0) {
					return 'Project name is required';
				}
				if (client) {
					const exists = await projectExists(client, { name: value, organization_id: orgId! });
					if (exists) {
						return `Project with name '${value}' already exists in this organization`;
					}
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
	const destIsDir = destExists ? statSync(dest).isDirectory() : false;
	const destEmpty = destIsDir ? readdirSync(dest).length === 0 : !destExists;

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

	if (auth && client && orgId) {
		await tui.spinner('Registering your project', async () => {
			const res = await projectCreate(client, {
				name: projectName,
				organization_id: orgId,
				provider: 'bunjs',
			});
			if (res.success && res.data) {
				return createProjectConfig(dest, {
					projectId: res.data.id,
					orgId,
					apiKey: res.data.api_key,
				});
			}
			tui.fatal(res.message ?? 'failed to register project');
		});
	}

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
