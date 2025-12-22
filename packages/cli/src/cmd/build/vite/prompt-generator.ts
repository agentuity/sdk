/**
 * Prompt Generator
 *
 * Generates AGENTS.md prompt files in src/agent/, src/api/, and src/web/ directories.
 * Uses version tracking to detect user modifications and avoid overwriting.
 *
 * Only runs in dev mode.
 */

import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { Logger } from '../../../types';
import { checkUpdateStatus } from '../../ai/prompt/version';
import {
	generateLLMPrompt as generateAgentPrompt,
	PROMPT_VERSION as AGENT_PROMPT_VERSION,
} from '../../ai/prompt/agent';
import {
	generateLLMPrompt as generateApiPrompt,
	PROMPT_VERSION as API_PROMPT_VERSION,
} from '../../ai/prompt/api';
import {
	generateLLMPrompt as generateWebPrompt,
	PROMPT_VERSION as WEB_PROMPT_VERSION,
} from '../../ai/prompt/web';

interface PromptConfig {
	name: string;
	folder: string;
	filename: string;
	version: number;
	generate: () => string;
}

const PROMPTS: PromptConfig[] = [
	{
		name: 'agent',
		folder: 'agent',
		filename: 'AGENTS.md',
		version: AGENT_PROMPT_VERSION,
		generate: generateAgentPrompt,
	},
	{
		name: 'api',
		folder: 'api',
		filename: 'AGENTS.md',
		version: API_PROMPT_VERSION,
		generate: generateApiPrompt,
	},
	{
		name: 'web',
		folder: 'web',
		filename: 'AGENTS.md',
		version: WEB_PROMPT_VERSION,
		generate: generateWebPrompt,
	},
];

/**
 * Generate or update prompt files in src/agent/, src/api/, and src/web/ directories.
 * Respects user modifications by checking content hash before overwriting.
 *
 * @param srcDir - The src/ directory path
 * @param logger - Logger for output
 */
export async function generatePromptFiles(srcDir: string, logger: Logger): Promise<void> {
	for (const prompt of PROMPTS) {
		await generatePromptFile(srcDir, prompt, logger);
	}
}

async function generatePromptFile(
	srcDir: string,
	config: PromptConfig,
	logger: Logger
): Promise<void> {
	const folderPath = join(srcDir, config.folder);
	const filePath = join(folderPath, config.filename);

	// Check if the folder exists
	let folderExists = false;
	try {
		const stat = await Bun.$`test -d ${folderPath}`.nothrow();
		folderExists = stat.exitCode === 0;
	} catch {
		folderExists = false;
	}

	if (!folderExists) {
		logger.trace(`Skipping ${config.name} prompt - src/${config.folder}/ does not exist`);
		return;
	}

	const file = Bun.file(filePath);
	const fileExists = await file.exists();

	if (!fileExists) {
		// File doesn't exist - create it
		await mkdir(folderPath, { recursive: true });
		const content = config.generate();
		await Bun.write(filePath, content);
		logger.debug(`Generated src/${config.folder}/${config.filename}`);
		return;
	}

	// File exists - check if it needs to be updated
	const existingContent = await file.text();
	const status = checkUpdateStatus(existingContent, config.version);

	if (status.isUserModified) {
		logger.trace(`Skipping ${config.name} prompt update - file has been modified by user`);
		return;
	}

	if (status.needsUpdate) {
		const content = config.generate();
		await Bun.write(filePath, content);
		logger.debug(
			`Updated src/${config.folder}/${config.filename} (v${status.fileVersion} → v${config.version})`
		);
		return;
	}

	logger.trace(`Skipping ${config.name} prompt - already up to date (v${config.version})`);
}
