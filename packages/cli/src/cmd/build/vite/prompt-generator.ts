/**
 * Prompt Generator
 *
 * Generates AGENTS.md prompt files in .agents/agentuity/sdk/[type]/ directories.
 * Also creates reference files in src/[type]/AGENTS.md (write-once, only if missing).
 *
 * Uses hash tracking to detect template changes in .agents/ folder.
 * Reference files in src/ are never overwritten once created.
 *
 * Only runs in dev mode.
 */

import { join, dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { Logger } from '../../../types';
import { needsUpdate } from '../../ai/prompt/version';
import {
	generateLLMPrompt as generateAgentPrompt,
	getPromptContent as getAgentContent,
} from '../../ai/prompt/agent';
import {
	generateLLMPrompt as generateApiPrompt,
	getPromptContent as getApiContent,
} from '../../ai/prompt/api';
import {
	generateLLMPrompt as generateWebPrompt,
	getPromptContent as getWebContent,
} from '../../ai/prompt/web';

interface PromptConfig {
	name: string;
	srcFolder: string;
	generate: () => string;
	getContent: () => string;
}

const PROMPTS: PromptConfig[] = [
	{
		name: 'agent',
		srcFolder: 'agent',
		generate: generateAgentPrompt,
		getContent: getAgentContent,
	},
	{
		name: 'api',
		srcFolder: 'api',
		generate: generateApiPrompt,
		getContent: getApiContent,
	},
	{
		name: 'web',
		srcFolder: 'web',
		generate: generateWebPrompt,
		getContent: getWebContent,
	},
];

/**
 * Generate the reference file content that points to .agents/
 */
function generateReferenceContent(name: string): string {
	return `See [.agents/agentuity/sdk/${name}/AGENTS.md](../../.agents/agentuity/sdk/${name}/AGENTS.md) for Agentuity ${name} development guidelines.
`;
}

/**
 * Generate or update prompt files.
 *
 * - .agents/agentuity/sdk/[type]/AGENTS.md: Full content, updated when hash differs
 * - src/[type]/AGENTS.md: Reference file, only created if missing
 *
 * @param srcDir - The src/ directory path
 * @param logger - Logger for output
 */
export async function generatePromptFiles(srcDir: string, logger: Logger): Promise<void> {
	const projectRoot = dirname(srcDir);

	for (const prompt of PROMPTS) {
		await generatePromptFile(projectRoot, srcDir, prompt, logger);
	}
}

async function generatePromptFile(
	projectRoot: string,
	srcDir: string,
	config: PromptConfig,
	logger: Logger
): Promise<void> {
	const srcFolderPath = join(srcDir, config.srcFolder);

	// Check if the src folder exists (e.g., src/agent/)
	const srcFolderExists = await Bun.file(srcFolderPath).exists().catch(() => false);
	if (!srcFolderExists) {
		// Try directory check
		try {
			const stat = await Bun.$`test -d ${srcFolderPath}`.nothrow();
			if (stat.exitCode !== 0) {
				logger.trace(`Skipping ${config.name} prompt - src/${config.srcFolder}/ does not exist`);
				return;
			}
		} catch {
			logger.trace(`Skipping ${config.name} prompt - src/${config.srcFolder}/ does not exist`);
			return;
		}
	}

	// Generate files
	await generateAgentsFile(projectRoot, config, logger);
	await generateReferenceFile(srcFolderPath, config, logger);
}

/**
 * Generate/update the .agents/agentuity/sdk/[type]/AGENTS.md file.
 * Overwrites if hash differs from source template.
 */
async function generateAgentsFile(
	projectRoot: string,
	config: PromptConfig,
	logger: Logger
): Promise<void> {
	const agentsDir = join(projectRoot, '.agents', 'agentuity', 'sdk', config.name);
	const filePath = join(agentsDir, 'AGENTS.md');

	const file = Bun.file(filePath);
	const fileExists = await file.exists();

	if (!fileExists) {
		// File doesn't exist - create it
		await mkdir(agentsDir, { recursive: true });
		const content = config.generate();
		await Bun.write(filePath, content);
		logger.debug(`Generated .agents/agentuity/sdk/${config.name}/AGENTS.md`);
		return;
	}

	// File exists - check if it needs to be updated
	const existingContent = await file.text();
	const sourceContent = config.getContent();

	if (needsUpdate(existingContent, sourceContent)) {
		const content = config.generate();
		await Bun.write(filePath, content);
		logger.debug(`Updated .agents/agentuity/sdk/${config.name}/AGENTS.md`);
		return;
	}

	logger.trace(`Skipping ${config.name} prompt - already up to date`);
}

/**
 * Generate the src/[type]/AGENTS.md reference file.
 * Only creates if missing (write-once).
 */
async function generateReferenceFile(
	srcFolderPath: string,
	config: PromptConfig,
	logger: Logger
): Promise<void> {
	const filePath = join(srcFolderPath, 'AGENTS.md');

	const file = Bun.file(filePath);
	const fileExists = await file.exists();

	if (fileExists) {
		logger.trace(`Skipping src/${config.srcFolder}/AGENTS.md - already exists`);
		return;
	}

	// Create the reference file
	const content = generateReferenceContent(config.name);
	await Bun.write(filePath, content);
	logger.debug(`Generated src/${config.srcFolder}/AGENTS.md (reference)`);
}
